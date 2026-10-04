export type ParticipantPaidBalance = {
  readonly lineId: string
  readonly paidFen: number
  readonly refundedFen: number
  readonly reservedFen: number
}

export type RefundCalculation = {
  readonly amountFen: number
  readonly lines: readonly { readonly lineId: string; readonly amountFen: number }[]
}

export class RefundCalculationError extends Error {
  readonly name = "RefundCalculationError"
  constructor(readonly code: "invalid_refund_selection" | "invalid_refund_balance") {
    super(code)
  }
}

const MAX_MONEY_FEN = 4_294_967_295

export function calculateParticipantRefund(
  balances: readonly ParticipantPaidBalance[],
  selectedLineIds: readonly string[],
): RefundCalculation {
  if (selectedLineIds.length === 0 || new Set(selectedLineIds).size !== selectedLineIds.length) {
    throw new RefundCalculationError("invalid_refund_selection")
  }
  const byId = new Map<string, ParticipantPaidBalance>()
  for (const balance of balances) {
    if (byId.has(balance.lineId) || [balance.paidFen, balance.refundedFen, balance.reservedFen]
      .some((value) => !Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY_FEN)
      || balance.refundedFen + balance.reservedFen > balance.paidFen) {
      throw new RefundCalculationError("invalid_refund_balance")
    }
    byId.set(balance.lineId, balance)
  }
  const lines = selectedLineIds.map((lineId) => {
    const balance = byId.get(lineId)
    if (balance === undefined) throw new RefundCalculationError("invalid_refund_selection")
    return { lineId, amountFen: balance.paidFen - balance.refundedFen - balance.reservedFen }
  })
  const amountFen = lines.reduce((total, line) => total + line.amountFen, 0)
  if (!Number.isSafeInteger(amountFen) || amountFen > MAX_MONEY_FEN) {
    throw new RefundCalculationError("invalid_refund_balance")
  }
  return { amountFen, lines }
}
