import { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } from "@linan/contracts"
import { BadRequestException, ConflictException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { OrderEntity, OrderLineEntity, PaymentEntity, RefundRequestEntity, RefundRequestLineEntity } from "../../domain/entities/index.js"
import { orderNotFound } from "./order.errors.js"
import type { StaffRefundRequestInput } from "./refund-request.parser.js"
import { calculateParticipantRefund, RefundCalculationError } from "./refund-calculation.js"

export async function lockOrder(manager: EntityManager, orderId: string): Promise<OrderEntity> {
  const order = await manager.findOne(OrderEntity, { where: { id: orderId }, lock: { mode: "pessimistic_write" } })
  if (order === null) {
    throw orderNotFound()
  }
  return order
}

export type RefundReplayMatchInput = {
  readonly routeOrderId: string
  readonly storedOrderId: string
  readonly storedReason: string
  readonly storedNote: string | null
  readonly storedLineIds: readonly string[]
  readonly requestedReason: string
  readonly requestedNote: string | null
  readonly requestedLineIds: readonly string[]
}

export function assertRefundReplayMatches(input: RefundReplayMatchInput): void {
  const storedLineIds = [...input.storedLineIds].sort()
  const requestedLineIds = [...input.requestedLineIds].sort()
  if (
    input.routeOrderId !== input.storedOrderId ||
    input.storedReason !== input.requestedReason ||
    input.storedNote !== input.requestedNote ||
    storedLineIds.join("\n") !== requestedLineIds.join("\n")
  ) {
    throw new ConflictException({ code: "idempotency_conflict", message: "idempotency key was already used for different refund input" })
  }
}

export async function assertReplayMatches(
  manager: EntityManager,
  request: RefundRequestEntity,
  routeOrderId: string,
  input: StaffRefundRequestInput,
): Promise<void> {
  const lines = await manager.find(RefundRequestLineEntity, { where: { refundRequestId: request.id }, order: { orderLineId: "ASC" } })
  assertRefundReplayMatches({
    routeOrderId,
    storedOrderId: request.orderId,
    storedReason: request.reason,
    storedNote: request.note,
    storedLineIds: lines.map((line) => line.orderLineId),
    requestedReason: input.reason,
    requestedNote: input.note,
    requestedLineIds: input.lineIds,
  })
}

export async function loadOrderLines(manager: EntityManager, order: OrderEntity): Promise<readonly OrderLineEntity[]> {
  const lines = await manager.find(OrderLineEntity, { where: { orderId: order.id }, order: { id: "ASC" } })
  if (lines.length === 0) {
    throw new ConflictException({ code: "refund_payment_unverified", message: "individual paid fees cannot be verified for this order" })
  }
  return lines
}

export function selectLines(lines: readonly OrderLineEntity[], lineIds: readonly string[]): readonly OrderLineEntity[] {
  const byId = new Map(lines.map((line) => [line.id, line]))
  return lineIds.map((lineId) => {
    const line = byId.get(lineId)
    if (line === undefined) {
      throw new BadRequestException({ code: "invalid_refund_selection", message: "selected line does not belong to this order" })
    }
    return line
  })
}

export async function assertPaidOrder(manager: EntityManager, order: OrderEntity): Promise<void> {
  const [lineSum, payments] = await Promise.all([
    manager.createQueryBuilder(OrderLineEntity, "line")
      .select("coalesce(sum(line.amount_fen), 0)", "amountFen")
      .where("line.order_id = :orderId", { orderId: order.id })
      .getRawOne<{ readonly amountFen: string }>(),
    manager.find(PaymentEntity, { where: { orderId: order.id, status: PAYMENT_STATUS.succeeded } }),
  ])
  const paidPayment = payments[0]
  if (order.status !== ORDER_STATUS.paid || order.paidFen !== order.amountFen || order.paidFen <= 0
    || Number(lineSum?.amountFen ?? 0) !== order.paidFen || payments.length !== 1 || paidPayment?.amountFen !== order.paidFen) {
    throw new ConflictException({ code: "refund_payment_unverified", message: "individual paid fees cannot be verified for this order" })
  }
}

export async function quoteRefund(
  manager: EntityManager,
  lines: readonly OrderLineEntity[],
  selectedLineIds: readonly string[],
): Promise<{ readonly amountFen: number; readonly lines: readonly { readonly lineId: string; readonly amountFen: number }[] }> {
  const refundLines = await manager.find(RefundRequestLineEntity, { where: { orderLineId: In(lines.map((line) => line.id)) } })
  const requestIds = [...new Set(refundLines.map((line) => line.refundRequestId))]
  const requests = requestIds.length === 0 ? [] : await manager.find(RefundRequestEntity, { where: { id: In(requestIds) } })
  const statusByRequest = new Map(requests.map((request) => [request.id, request.status]))
  try {
    return calculateParticipantRefund(lines.map((line) => ({
      lineId: line.id,
      paidFen: line.amountFen,
      refundedFen: refundLines
        .filter((refundLine) => refundLine.orderLineId === line.id && statusByRequest.get(refundLine.refundRequestId) === REFUND_STATUS.succeeded)
        .reduce((total, refundLine) => total + refundLine.amountFen, 0),
      reservedFen: refundLines
        .filter((refundLine) => refundLine.orderLineId === line.id && statusByRequest.get(refundLine.refundRequestId) === REFUND_STATUS.pending)
        .reduce((total, refundLine) => total + refundLine.amountFen, 0),
    })), selectedLineIds)
  } catch (error) {
    if (error instanceof RefundCalculationError) {
      throw new BadRequestException({ code: error.code, message: error.message })
    }
    throw error
  }
}
