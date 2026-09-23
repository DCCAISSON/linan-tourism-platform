import { ORDER_STATUS, PAYMENT_STATUS, REFUND_PROVIDER, REFUND_STATUS, ROSTER_STATUS } from "@linan/contracts"
import { NotFoundException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { EnrollmentEntity, OrderEntity, OrderLineEntity, PaymentEntity, RefundRequestEntity, RefundRequestLineEntity, RosterEntryEntity, TourSessionEntity } from "../../domain/entities/index.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { lockOrder } from "./refund-balance.js"
import { buildOrderRefundView } from "./refund-read-model.js"
import type { StaffRefundResultInput } from "./refund-request.parser.js"
import type { StaffRefundResponse } from "./order.types.js"

type RefundResultCommand = {
  readonly order: OrderEntity
  readonly request: RefundRequestEntity
  readonly input: StaffRefundResultInput
  readonly actorId: string | null
}

export async function applyRefundResult(manager: EntityManager, command: RefundResultCommand): Promise<void> {
  const { order, request, input, actorId } = command
  if (input.outcome === "succeeded") {
    const enrollment = await manager.findOneByOrFail(EnrollmentEntity, { id: order.enrollmentId })
    await manager.findOneOrFail(TourSessionEntity, { where: { id: enrollment.tourSessionId }, lock: { mode: "pessimistic_write" } })
    const refundLines = await manager.find(RefundRequestLineEntity, { where: { refundRequestId: request.id } })
    const orderLines = await manager.find(OrderLineEntity, { where: { id: In(refundLines.map((line) => line.orderLineId)) } })
    for (const line of orderLines) {
      await manager.update(RosterEntryEntity, { enrollmentParticipantId: line.enrollmentParticipantId }, { status: ROSTER_STATUS.cancelled })
    }
    const succeededFen = (await buildOrderRefundView(manager, order.id, order.amountFen)).summary.refundedFen + request.amountFen
    if (succeededFen >= order.paidFen) {
      order.status = ORDER_STATUS.refunded
      await manager.save(order)
      const payments = await manager.find(PaymentEntity, { where: { orderId: order.id, status: PAYMENT_STATUS.succeeded } })
      await manager.save(PaymentEntity, payments.map((payment) => ({ ...payment, status: PAYMENT_STATUS.refunded })))
    }
  }
  request.status = input.outcome === "succeeded" ? REFUND_STATUS.succeeded : REFUND_STATUS.failed
  request.processedByStaffId = actorId
  request.processedAt = new Date()
  request.failureMessage = input.outcome === "failed" ? input.failureMessage ?? "refund failed" : null
  await manager.save(request)
}

export async function applyProviderRefundResult(manager: EntityManager, refundId: string, input: {
  readonly status: "succeeded" | "failed"; readonly failureMessage: string | null
}): Promise<StaffRefundResponse> {
  const target = await manager.findOneBy(RefundRequestEntity, { id: refundId })
  if (target === null || target.provider === REFUND_PROVIDER.localValidation) throw new NotFoundException({ code: "not_found", message: "provider refund request was not found" })
  const order = await lockOrder(manager, target.orderId)
  const request = await manager.findOneOrFail(RefundRequestEntity, { where: { id: target.id }, lock: { mode: "pessimistic_write" } })
  if (request.status === REFUND_STATUS.pending) {
    await applyRefundResult(manager, { order, request, input: { outcome: input.status, failureMessage: input.failureMessage }, actorId: null })
    await new AuditLogService().record(manager, {
      organizationId: order.organizationId, actorId: "wechat-provider", action: `refund.provider.${input.status}`,
      targetType: "refund_request", targetId: request.id,
    })
  }
  return toStaffRefundResponse(manager, request)
}

export async function toStaffRefundResponse(manager: EntityManager, request: RefundRequestEntity): Promise<StaffRefundResponse> {
  const view = await buildOrderRefundView(manager, request.orderId, Number.MAX_SAFE_INTEGER)
  const item = view.history.find((history) => history.id === request.id)
  if (item === undefined) throw new NotFoundException({ code: "not_found", message: "refund request was not found" })
  return { ...item, orderId: request.orderId }
}
