import { createHash } from "node:crypto"
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { OrderChangeRequestEntity } from "../../domain/entities/order-change-request.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { findScopedOrder, lockScopedOrder } from "../order/order.persistence.js"
import { assertPaidOrder } from "../order/refund-balance.js"
import { assertVerifiedChangeIdentity } from "./order-change.parser.js"
import { activeRefundLineIds, assertNoChangeRefundConflict, prepareChangeParticipant, readOriginalOrderSnapshot, toOrderChangeResponse } from "./order-change.persistence.js"
import type { ChangeHistoryEntry, OrderChangeList, OrderChangeResponse, OrderChangeStatus, ReviewOrderChange, SubmitOrderChange, SupplementOrderChange } from "./order-change.types.js"

@Injectable()
export class OrderChangeService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
  ) {}

  async submit(identity: EnrollmentIdentity, orderId: string, input: SubmitOrderChange): Promise<OrderChangeResponse> {
    assertVerifiedChangeIdentity(identity)
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const scoped = await lockScopedOrder(manager, identity, orderId)
      const participant = await prepareChangeParticipant(manager, scoped.order.organizationId, input.participant)
      const fingerprint = createHash("sha256").update(JSON.stringify({ kind: input.kind, originalLineId: input.originalLineId, reason: input.reason,
        displayName: participant.displayName, participantKind: participant.participantKind, schoolId: participant.schoolId, gradeId: participant.gradeId, classId: participant.classId,
        identityHash: participant.personData.identityHash, phoneHash: participant.personData.phoneHash })).digest("hex")
      const existing = await manager.findOneBy(OrderChangeRequestEntity, { orderId, idempotencyKey: input.idempotencyKey })
      const refundLines = await activeRefundLineIds(manager, orderId)
      if (existing !== null) {
        if (existing.submissionFingerprint !== fingerprint) throw new ConflictException({ code: "idempotency_conflict", message: "该次提交已用于其他内容，请刷新后重试" })
        return toOrderChangeResponse(existing, refundLines)
      }
      await assertPaidOrder(manager, scoped.order)
      const snapshot = await readOriginalOrderSnapshot(manager, scoped)
      if (input.kind === "replacement" && !snapshot.lines.some((line) => line.id === input.originalLineId)) {
        throw new BadRequestException({ code: "order_change_line_invalid", message: "请选择本订单中的原参加人" })
      }
      assertNoChangeRefundConflict(input.kind, input.originalLineId, refundLines)
      const row = await manager.save(OrderChangeRequestEntity, {
        id: makeId("order-change"), organizationId: scoped.order.organizationId, orderId, kind: input.kind, originalLineId: input.originalLineId,
        idempotencyKey: input.idempotencyKey, submissionFingerprint: fingerprint, reason: input.reason, status: "submitted", version: 1,
        originalSnapshot: snapshot, proposedParticipant: participant,
        history: [{ version: 1, status: "submitted", action: "submitted", actorId: identity.actorId, actorName: "申请人", note: input.reason, at: new Date().toISOString() }],
      })
      return toOrderChangeResponse(row, refundLines)
    })
  }

  async listFamily(identity: EnrollmentIdentity, orderId: string): Promise<OrderChangeList> {
    assertVerifiedChangeIdentity(identity)
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    const [rows, refundLines] = await Promise.all([
      manager.find(OrderChangeRequestEntity, { where: { orderId }, order: { createdAt: "DESC", id: "DESC" } }),
      activeRefundLineIds(manager, orderId),
    ])
    return { schoolId: scoped.order.organizationId, activeRefundLineIds: refundLines, requests: rows.map((row) => toOrderChangeResponse(row, refundLines)) }
  }

  async supplement(identity: EnrollmentIdentity, orderId: string, id: string, input: SupplementOrderChange): Promise<OrderChangeResponse> {
    assertVerifiedChangeIdentity(identity)
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const scoped = await lockScopedOrder(manager, identity, orderId)
      const row = await lockChange(manager, id, input.expectedVersion, orderId)
      if (row.status !== "needs_information") throw invalidState("只有待补充的申请可以补充材料")
      const refundLines = await activeRefundLineIds(manager, orderId)
      assertNoChangeRefundConflict(row.kind, row.originalLineId, refundLines)
      if (input.participant !== undefined) row.proposedParticipant = await prepareChangeParticipant(manager, scoped.order.organizationId, input.participant)
      row.reason = input.reason
      appendHistory(row, { status: "submitted", action: "resubmitted", actorId: identity.actorId, actorName: "申请人", note: input.reason })
      return toOrderChangeResponse(await manager.save(row), refundLines)
    })
  }

  async withdraw(identity: EnrollmentIdentity, orderId: string, id: string, expectedVersion: number): Promise<OrderChangeResponse> {
    assertVerifiedChangeIdentity(identity)
    return (await this.database.getDataSource()).transaction(async (manager) => {
      await lockScopedOrder(manager, identity, orderId)
      const row = await lockChange(manager, id, expectedVersion, orderId)
      if (row.status !== "submitted" && row.status !== "needs_information") throw invalidState("当前申请不能撤回，请联系工作人员")
      appendHistory(row, { status: "withdrawn", action: "withdrawn", actorId: identity.actorId, actorName: "申请人", note: "申请人撤回申请" })
      return toOrderChangeResponse(await manager.save(row), await activeRefundLineIds(manager, orderId))
    })
  }

  async listStaff(staff: StaffAccess, status: OrderChangeStatus | undefined): Promise<readonly OrderChangeResponse[]> {
    this.access.assertOrderReadScope(staff)
    const manager = (await this.database.getDataSource()).manager
    const rows = await manager.find(OrderChangeRequestEntity, { where: status === undefined ? {} : { status }, order: { createdAt: "DESC", id: "DESC" } })
    return Promise.all(rows.map(async (row) => toOrderChangeResponse(row, await activeRefundLineIds(manager, row.orderId))))
  }

  async review(staff: StaffAccess, id: string, input: ReviewOrderChange): Promise<OrderChangeResponse> {
    this.assertManage(staff)
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const row = await lockChange(manager, id, input.expectedVersion)
      if (row.status !== "submitted" && row.status !== "needs_information") throw invalidState("当前申请已处理，请刷新后查看")
      const refundLines = await activeRefundLineIds(manager, row.orderId)
      if (input.decision === "approved") assertNoChangeRefundConflict(row.kind, row.originalLineId, refundLines)
      const actor = await manager.findOneByOrFail(StaffAccountEntity, { id: staff.actorId })
      appendHistory(row, { status: input.decision, action: "reviewed", actorId: staff.actorId, actorName: actor.displayName, note: input.note })
      return toOrderChangeResponse(await manager.save(row), refundLines)
    })
  }

  async addNote(staff: StaffAccess, id: string, input: { readonly expectedVersion: number; readonly note: string }): Promise<OrderChangeResponse> {
    this.assertManage(staff)
    return (await this.database.getDataSource()).transaction(async (manager) => {
      const row = await lockChange(manager, id, input.expectedVersion)
      if (row.status !== "approved") throw invalidState("请先审核申请，再追加实际处理说明")
      const actor = await manager.findOneByOrFail(StaffAccountEntity, { id: staff.actorId })
      appendHistory(row, { status: "approved", action: "note", actorId: staff.actorId, actorName: actor.displayName, note: input.note })
      return toOrderChangeResponse(await manager.save(row), await activeRefundLineIds(manager, row.orderId))
    })
  }

  private assertManage(staff: StaffAccess): void {
    this.access.assertOrderReadScope(staff)
    if (!staff.permissionKeys.has("roster.correct")) throw new ForbiddenException({ code: "scope_forbidden", message: "当前账号只能查看人员变更申请" })
  }
}

async function lockChange(manager: EntityManager, id: string, expectedVersion: number, orderId?: string): Promise<OrderChangeRequestEntity> {
  const row = await manager.findOne(OrderChangeRequestEntity, { where: orderId === undefined ? { id } : { id, orderId }, lock: { mode: "pessimistic_write" } })
  if (row === null) throw new NotFoundException({ code: "not_found", message: "未找到该人员变更申请" })
  if (row.version !== expectedVersion) throw new ConflictException({ code: "order_change_version_conflict", message: "申请已更新，请刷新后重试" })
  return row
}

function appendHistory(row: OrderChangeRequestEntity, entry: Omit<ChangeHistoryEntry, "version" | "at">): void {
  row.version += 1
  row.status = entry.status
  row.history = [...row.history, { ...entry, version: row.version, at: new Date().toISOString() }]
}

function invalidState(message: string): ConflictException {
  return new ConflictException({ code: "order_change_state_conflict", message })
}
