import { DOMAIN_POLICY_VERSION, REFUND_PROVIDER, REFUND_STATUS, type RefundProvider } from "@linan/contracts"
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { QueryFailedError, type EntityManager } from "typeorm"
import { OrderEntity, RefundRequestEntity, RefundRequestLineEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffRefundRequestInput, StaffRefundResultInput } from "./refund-request.parser.js"
import { assertPaidOrder, assertReplayMatches, loadOrderLines, lockOrder, quoteRefund, selectLines } from "./refund-balance.js"
import { applyRefundResult, toStaffRefundResponse } from "./refund-result.js"
import type { StaffRefundResponse } from "./order.types.js"

export { assertRefundReplayMatches } from "./refund-balance.js"

@Injectable()
export class StaffRefundService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async create(orderId: string, input: StaffRefundRequestInput, actorId: string): Promise<StaffRefundResponse> {
    if (process.env["NODE_ENV"] === "production") {
      throw new NotFoundException({ code: "local_refund_unavailable", message: "当前未开放退款执行" })
    }
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const order = await lockOrder(manager, orderId)
      return createStaffRefundRequest(manager, order, { input, actorId, provider: REFUND_PROVIDER.localValidation })
    }).catch((error: unknown) => {
      if (error instanceof QueryFailedError && "code" in error.driverError && error.driverError.code === "ER_DUP_ENTRY"
        && /for key '(?:refund_requests\.)?uq_refund_requests_org_idempotency_key'$/.test(error.driverError.message)) {
        throw new ConflictException({ code: "idempotency_conflict", message: "idempotency key was already used for a refund request" })
      }
      throw error
    })
  }

  async processLocalResult(orderId: string, refundId: string, input: StaffRefundResultInput, actorId: string): Promise<StaffRefundResponse> {
    if (process.env["NODE_ENV"] === "production") {
      throw new NotFoundException({ code: "local_refund_unavailable", message: "当前未开放退款执行" })
    }
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const order = await lockOrder(manager, orderId)
      const request = await manager.findOne(RefundRequestEntity, {
        where: { id: refundId, orderId: order.id, organizationId: order.organizationId }, lock: { mode: "pessimistic_write" },
      })
      if (request === null || request.provider !== REFUND_PROVIDER.localValidation) {
        throw new NotFoundException({ code: "not_found", message: "local refund request was not found" })
      }
      if (request.status !== REFUND_STATUS.pending) return toStaffRefundResponse(manager, request)
      await applyRefundResult(manager, { order, request, input, actorId })
      await this.auditLog.record(manager, {
        organizationId: order.organizationId, actorId,
        action: input.outcome === "succeeded" ? "refund.succeed" : "refund.fail",
        targetType: "refund_request", targetId: request.id,
      })
      return toStaffRefundResponse(manager, request)
    })
  }
}

type CreateRefundCommand = {
  readonly input: StaffRefundRequestInput
  readonly actorId: string
  readonly provider: RefundProvider
}

export async function createStaffRefundRequest(manager: EntityManager, order: OrderEntity, command: CreateRefundCommand): Promise<StaffRefundResponse> {
  const { input, actorId, provider } = command
  const replay = await manager.findOneBy(RefundRequestEntity, { organizationId: order.organizationId, idempotencyKey: input.idempotencyKey })
  if (replay !== null) {
    await assertReplayMatches(manager, replay, order.id, input)
    return toStaffRefundResponse(manager, replay)
  }
  const lines = await loadOrderLines(manager, order)
  const selected = selectLines(lines, input.lineIds)
  await assertPaidOrder(manager, order)
  const quote = await quoteRefund(manager, lines, input.lineIds)
  if (quote.lines.some((line) => line.amountFen <= 0)) {
    throw new ConflictException({ code: "refund_line_already_refunded", message: "selected participant has no refundable balance" })
  }
  const request = await manager.save(RefundRequestEntity, {
    id: makeId("refund"), organizationId: order.organizationId, orderId: order.id,
    provider, idempotencyKey: input.idempotencyKey, status: REFUND_STATUS.pending,
    reason: input.reason, note: input.note, amountFen: quote.amountFen,
    requestedByStaffId: actorId, requestedAt: new Date(), policyVersion: DOMAIN_POLICY_VERSION,
  })
  await manager.save(RefundRequestLineEntity, selected.map((line) => ({
    id: makeId("refund-line"), organizationId: order.organizationId, refundRequestId: request.id,
    orderLineId: line.id, amountFen: quote.lines.find((quoted) => quoted.lineId === line.id)?.amountFen ?? 0,
    policyVersion: DOMAIN_POLICY_VERSION,
  })))
  await new AuditLogService().record(manager, {
    organizationId: order.organizationId, actorId, action: "refund.create", targetType: "refund_request", targetId: request.id,
  })
  return toStaffRefundResponse(manager, request)
}
