import { REFUND_STATUS } from "@linan/contracts"
import { In, type EntityManager } from "typeorm"
import { OrderLineEntity, RefundRequestEntity, RefundRequestLineEntity } from "../../domain/entities/index.js"
import type {
  ParticipantRefundStatus,
  RefundHistoryItem,
  RefundSummary,
  StaffRefundLineResponse,
} from "./order.types.js"

export type OrderRefundView = {
  readonly summary: RefundSummary
  readonly history: readonly RefundHistoryItem[]
  readonly participants: ReadonlyMap<string, { readonly refundedFen: number; readonly pendingFen: number; readonly refundStatus: ParticipantRefundStatus }>
}

const EMPTY_SUMMARY: RefundSummary = { status: "none", refundedFen: 0, pendingFen: 0, failedCount: 0 }

export async function buildOrderRefundView(manager: EntityManager, orderId: string, orderAmountFen: number): Promise<OrderRefundView> {
  const requests = await manager.find(RefundRequestEntity, { where: { orderId }, order: { requestedAt: "ASC", id: "ASC" } })
  if (requests.length === 0) {
    return { summary: EMPTY_SUMMARY, history: [], participants: new Map() }
  }
  const requestIds = requests.map((request) => request.id)
  const lines = await manager.find(RefundRequestLineEntity, {
    where: { refundRequestId: In(requestIds) },
    order: { createdAt: "ASC", id: "ASC" },
  })
  const orderLines = await manager.find(OrderLineEntity, { where: { orderId }, order: { id: "ASC" } })
  const orderLinesById = new Map(orderLines.map((line) => [line.id, line]))
  const requestsById = new Map(requests.map((request) => [request.id, request]))
  const linesByRequest = new Map<string, StaffRefundLineResponse[]>()
  const participantBalances = new Map<string, { refundedFen: number; pendingFen: number; failedCount: number }>()
  for (const line of lines) {
    const request = requestsById.get(line.refundRequestId)
    const orderLine = orderLinesById.get(line.orderLineId)
    if (request === undefined || orderLine === undefined) {
      continue
    }
    const existingLines = linesByRequest.get(request.id) ?? []
    linesByRequest.set(request.id, [...existingLines, {
      lineId: orderLine.id,
      displayName: orderLine.displayNameSnapshot,
      amountFen: line.amountFen,
    }])
    const balance = participantBalances.get(orderLine.id) ?? { refundedFen: 0, pendingFen: 0, failedCount: 0 }
    participantBalances.set(orderLine.id, addLineBalance(balance, request.status, line.amountFen))
  }
  const refundedFen = sumRequests(requests, REFUND_STATUS.succeeded)
  const pendingFen = sumRequests(requests, REFUND_STATUS.pending)
  const failedCount = requests.filter((request) => request.status === REFUND_STATUS.failed).length
  return {
    summary: {
      status: refundedFen === 0 ? "none" : refundedFen >= orderAmountFen ? "full" : "partial",
      refundedFen,
      pendingFen,
      failedCount,
    },
    history: requests.map((request) => ({
      id: request.id,
      status: request.status,
      amountFen: request.amountFen,
      reason: request.reason,
      note: request.note,
      requestedAt: request.requestedAt.toISOString(),
      processedAt: request.processedAt?.toISOString() ?? null,
      failureMessage: request.failureMessage,
      lines: linesByRequest.get(request.id) ?? [],
    })),
    participants: new Map([...participantBalances].map(([lineId, balance]) => [lineId, {
      refundedFen: balance.refundedFen,
      pendingFen: balance.pendingFen,
      refundStatus: participantStatus(balance),
    }])),
  }
}

function addLineBalance(
  balance: { readonly refundedFen: number; readonly pendingFen: number; readonly failedCount: number },
  status: RefundRequestEntity["status"],
  amountFen: number,
): { readonly refundedFen: number; readonly pendingFen: number; readonly failedCount: number } {
  switch (status) {
    case REFUND_STATUS.succeeded:
      return { ...balance, refundedFen: balance.refundedFen + amountFen }
    case REFUND_STATUS.pending:
      return { ...balance, pendingFen: balance.pendingFen + amountFen }
    case REFUND_STATUS.failed:
      return { ...balance, failedCount: balance.failedCount + 1 }
  }
}

function participantStatus(balance: { readonly refundedFen: number; readonly pendingFen: number; readonly failedCount: number }): ParticipantRefundStatus {
  if (balance.pendingFen > 0) {
    return "pending"
  }
  if (balance.refundedFen > 0) {
    return "refunded"
  }
  return balance.failedCount > 0 ? "failed" : "none"
}

function sumRequests(requests: readonly RefundRequestEntity[], status: RefundRequestEntity["status"]): number {
  return requests
    .filter((request) => request.status === status)
    .reduce((total, request) => total + request.amountFen, 0)
}
