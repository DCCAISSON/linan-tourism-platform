import { REFUND_PROVIDER, REFUND_STATUS } from "@linan/contracts"
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { RefundApplicationEntity } from "../../domain/entities/refund-application.entity.js"
import { RefundRequestEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { findScopedOrder, lockScopedOrder } from "../order/order.persistence.js"
import { createStaffRefundRequest } from "../order/staff-refund.service.js"
import { applyRefundResult } from "../order/refund-result.js"
import { assertPaidOrder, loadOrderLines, lockOrder, quoteRefund, selectLines } from "../order/refund-balance.js"
import type { StaffRefundRequestInput } from "../order/refund-request.parser.js"
import { WechatPaymentService } from "../wechat/wechat-payment.service.js"
import { assertApplicationPermission, assertApplicationTransition, assertLocalExecutionAvailable, type ExecuteInput, type ReviewInput } from "./refund-application.policy.js"
import type { RefundApplicationResponse } from "./refund-application.types.js"

@Injectable()
export class RefundApplicationService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(WechatPaymentService) private readonly wechatPayments: WechatPaymentService,
  ) {}

  async submit(identity: EnrollmentIdentity, orderId: string, input: StaffRefundRequestInput): Promise<RefundApplicationResponse> {
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const scoped = await lockScopedOrder(manager, identity, orderId)
      const replay = await manager.findOneBy(RefundApplicationEntity, { orderId: scoped.order.id, idempotencyKey: input.idempotencyKey })
      if (replay !== null) {
        assertApplicationReplayMatches(replay, input)
        return toApplicationResponse(manager, replay)
      }
      const lines = await loadOrderLines(manager, scoped.order)
      const selected = selectLines(lines, input.lineIds)
      await assertPaidOrder(manager, scoped.order)
      await assertNoActiveApplication(manager, scoped.order.id, input.lineIds)
      const quote = await quoteRefund(manager, lines, input.lineIds)
      if (quote.lines.some((line) => line.amountFen <= 0)) {
        throw new ConflictException({ code: "refund_line_already_refunded", message: "selected participant has no refundable balance" })
      }
      const app = await manager.save(RefundApplicationEntity, {
        id: makeId("refund-app"), organizationId: scoped.order.organizationId, orderId: scoped.order.id,
        idempotencyKey: input.idempotencyKey, status: "submitted", reason: input.reason, amountFen: quote.amountFen,
        lines: selected.map((line) => ({
          lineId: line.id,
          displayName: line.displayNameSnapshot,
          amountFen: quote.lines.find((item) => item.lineId === line.id)?.amountFen ?? 0,
        })),
      })
      return toApplicationResponse(manager, app)
    })
  }

  async listFamily(identity: EnrollmentIdentity, orderId: string): Promise<readonly RefundApplicationResponse[]> {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    return readApplications(manager, { orderId: scoped.order.id })
  }

  async withdraw(identity: EnrollmentIdentity, orderId: string, applicationId: string): Promise<RefundApplicationResponse> {
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const scoped = await lockScopedOrder(manager, identity, orderId)
      const app = await lockApplication(manager, applicationId, scoped.order.id)
      assertApplicationTransition(app.status, "cancelled")
      app.status = "cancelled"
      await manager.save(app)
      return toApplicationResponse(manager, app)
    })
  }

  async listStaff(access: StaffAccess, status: string | undefined): Promise<readonly RefundApplicationResponse[]> {
    assertApplicationPermission(access, "read")
    const where = status === undefined ? {} : { status: parseApplicationStatus(status) }
    return readApplications((await this.database.getDataSource()).manager, where)
  }

  async review(access: StaffAccess, applicationId: string, input: ReviewInput): Promise<RefundApplicationResponse> {
    assertApplicationPermission(access, "refunds.review")
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const app = await lockApplication(manager, applicationId)
      assertApplicationTransition(app.status, input.decision)
      app.status = input.decision
      app.reviewReason = input.reason
      app.reviewedByStaffId = access.actorId
      app.reviewedAt = new Date()
      await manager.save(app)
      await this.auditLog.record(manager, {
        organizationId: app.organizationId,
        actorId: access.actorId,
        action: `refund_application.${input.decision}`,
        targetType: "refund_application",
        targetId: app.id,
      })
      return toApplicationResponse(manager, app)
    })
  }

  async execute(access: StaffAccess, applicationId: string, input: ExecuteInput): Promise<RefundApplicationResponse> {
    assertApplicationPermission(access, "refunds.execute")
    if (process.env["NODE_ENV"] === "production") {
      if (input.outcome !== "succeeded") {
        throw new ConflictException({ code: "manual_refund_result_unavailable", message: "真实退款结果由微信确认，不能人工登记" })
      }
      return this.executeWechat(access, applicationId)
    }
    assertLocalExecutionAvailable()
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const found = await manager.findOneBy(RefundApplicationEntity, { id: applicationId })
      if (found === null) throw applicationNotFound()
      const order = await lockOrder(manager, found.orderId)
      const app = await lockApplication(manager, applicationId, order.id)
      if (app.status !== "approved") {
        throw new ConflictException({ code: "refund_application_not_approved", message: "申请尚未批准，不能执行退款" })
      }
      const refund = await createStaffRefundRequest(manager, order, {
        input: { lineIds: app.lines.map((line) => line.lineId), reason: app.reason, note: null, idempotencyKey: `refund-application:${app.id}` },
        actorId: access.actorId,
        provider: REFUND_PROVIDER.localValidation,
      })
      app.refundRequestId = refund.id
      await manager.save(app)
      const request = await manager.findOneOrFail(RefundRequestEntity, {
        where: { id: refund.id, orderId: order.id },
        lock: { mode: "pessimistic_write" },
      })
      if (request.status === REFUND_STATUS.pending) {
        await applyRefundResult(manager, { order, request, input, actorId: access.actorId })
        await this.auditLog.record(manager, {
          organizationId: order.organizationId,
          actorId: access.actorId,
          action: input.outcome === "succeeded" ? "refund_application.execute_succeeded" : "refund_application.execute_failed",
          targetType: "refund_application",
          targetId: app.id,
        })
      }
      return toApplicationResponse(manager, app)
    })
  }

  private async executeWechat(access: StaffAccess, applicationId: string): Promise<RefundApplicationResponse> {
    const dataSource = await this.database.getDataSource()
    const prepared = await dataSource.transaction(async (manager) => {
      const app = await lockApplication(manager, applicationId)
      if (app.status !== "approved") {
        throw new ConflictException({ code: "refund_application_not_approved", message: "申请尚未批准，不能执行退款" })
      }
      if (app.refundRequestId !== null) return { response: await toApplicationResponse(manager, app), command: null }
      return {
        response: null,
        command: {
          orderId: app.orderId,
          input: {
            lineIds: app.lines.map((line) => line.lineId),
            reason: app.reason,
            note: null,
            idempotencyKey: `refund-application:${app.id}`,
          },
        },
      }
    })
    if (prepared.command === null) return prepared.response
    const refund = await this.wechatPayments.createWechatRefund(prepared.command.orderId, prepared.command.input, access.actorId)
    return dataSource.transaction(async (manager) => {
      const app = await lockApplication(manager, applicationId, prepared.command.orderId)
      if (app.refundRequestId !== null && app.refundRequestId !== refund.id) {
        throw new ConflictException({ code: "refund_application_execution_conflict", message: "退款申请已关联其他退款记录" })
      }
      if (app.refundRequestId === null) {
        app.refundRequestId = refund.id
        await manager.save(app)
        await this.auditLog.record(manager, {
          organizationId: app.organizationId,
          actorId: access.actorId,
          action: "refund_application.execute_started",
          targetType: "refund_application",
          targetId: app.id,
        })
      }
      return toApplicationResponse(manager, app)
    })
  }
}

async function readApplications(manager: EntityManager, where: Partial<Pick<RefundApplicationEntity, "orderId" | "status">>): Promise<readonly RefundApplicationResponse[]> {
  const apps = await manager.find(RefundApplicationEntity, { where, order: { createdAt: "DESC", id: "DESC" } })
  return Promise.all(apps.map((app) => toApplicationResponse(manager, app)))
}

async function lockApplication(manager: EntityManager, applicationId: string, orderId?: string): Promise<RefundApplicationEntity> {
  const where = orderId === undefined ? { id: applicationId } : { id: applicationId, orderId }
  const app = await manager.findOne(RefundApplicationEntity, { where, lock: { mode: "pessimistic_write" } })
  if (app === null) throw applicationNotFound()
  return app
}

async function toApplicationResponse(manager: EntityManager, app: RefundApplicationEntity): Promise<RefundApplicationResponse> {
  const refund = app.refundRequestId === null ? null : await manager.findOneBy(RefundRequestEntity, { id: app.refundRequestId })
  return {
    id: app.id,
    orderId: app.orderId,
    status: app.status,
    reason: app.reason,
    amountFen: app.amountFen,
    lines: app.lines,
    submittedAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    reviewReason: app.reviewReason,
    reviewedAt: app.reviewedAt?.toISOString() ?? null,
    refundRequestId: app.refundRequestId,
    refundStatus: refund?.status ?? null,
  }
}

async function assertNoActiveApplication(manager: EntityManager, orderId: string, lineIds: readonly string[]): Promise<void> {
  const active = await manager.find(RefundApplicationEntity, { where: { orderId, status: In(["submitted", "approved"]) } })
  if (active.some((app) => app.refundRequestId === null && app.lines.some((line) => lineIds.includes(line.lineId)))) {
    throw new ConflictException({ code: "refund_application_duplicate_line", message: "同一人员已有待处理退款申请" })
  }
}

function assertApplicationReplayMatches(app: RefundApplicationEntity, input: StaffRefundRequestInput): void {
  const storedLineIds = app.lines.map((line) => line.lineId).sort()
  const requestedLineIds = [...input.lineIds].sort()
  if (app.reason !== input.reason || storedLineIds.join("\n") !== requestedLineIds.join("\n")) {
    throw new ConflictException({ code: "idempotency_conflict", message: "idempotency key was already used for different refund application input" })
  }
}

function parseApplicationStatus(status: string): RefundApplicationEntity["status"] {
  if (status === "submitted" || status === "approved" || status === "rejected" || status === "cancelled") return status
  throw new ConflictException({ code: "invalid_refund_application_status", message: "未知退款申请状态" })
}

function applicationNotFound(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "refund application was not found" })
}
