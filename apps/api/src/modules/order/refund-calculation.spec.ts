import { describe, expect, it } from "vitest"
import { calculateParticipantRefund, RefundCalculationError, type ParticipantPaidBalance } from "./refund-calculation.js"

const balances: readonly ParticipantPaidBalance[] = [
  { lineId: "child-a", paidFen: 12800, refundedFen: 0, reservedFen: 0 },
  { lineId: "child-b", paidFen: 188000, refundedFen: 0, reservedFen: 0 },
]

describe("Participant remaining-paid refund calculation", () => {
  it("uses selected stored fees when participants have different prices", () => {
    // Given
    const selected = ["child-b"]
    // When
    const result = calculateParticipantRefund(balances, selected)
    // Then
    expect(result).toEqual({ amountFen: 188000, lines: [{ lineId: "child-b", amountFen: 188000 }] })
  })

  it("subtracts completed and reserved refunds when remaining balances are supplied", () => {
    // Given
    const history = [
      { lineId: "child-a", paidFen: 12800, refundedFen: 2800, reservedFen: 3000 },
      { lineId: "child-b", paidFen: 188000, refundedFen: 1000, reservedFen: 2000 },
    ]
    // When
    const result = calculateParticipantRefund(history, ["child-a", "child-b"])
    // Then
    expect(result).toEqual({ amountFen: 192000, lines: [
      { lineId: "child-a", amountFen: 7000 }, { lineId: "child-b", amountFen: 185000 },
    ] })
  })

  it("returns zero remaining money when the selected person's fees are fully refunded", () => {
    // Given
    const history = [{ lineId: "child-a", paidFen: 12800, refundedFen: 12800, reservedFen: 0 }]
    // When
    const result = calculateParticipantRefund(history, ["child-a"])
    // Then
    expect(result.amountFen).toBe(0)
  })

  it.each([{ ids: [] }, { ids: ["unknown"] }, { ids: ["child-a", "child-a"] }])("rejects an invalid selection $ids", ({ ids }) => {
    // When
    const action = () => calculateParticipantRefund(balances, ids)
    // Then
    expect(action).toThrowError(new RefundCalculationError("invalid_refund_selection"))
  })

  it.each([
    { paidFen: -1, refundedFen: 0, reservedFen: 0 },
    { paidFen: 1.5, refundedFen: 0, reservedFen: 0 },
    { paidFen: 12800, refundedFen: 12801, reservedFen: 0 },
    { paidFen: 12800, refundedFen: 10000, reservedFen: 3000 },
    { paidFen: 12800, refundedFen: 0, reservedFen: -1 },
    { paidFen: 4_294_967_296, refundedFen: 0, reservedFen: 0 },
  ])("rejects inconsistent remaining-paid balances %j", (balance) => {
    // Given
    const history = [{ lineId: "child-a", ...balance }]
    // When
    const action = () => calculateParticipantRefund(history, ["child-a"])
    // Then
    expect(action).toThrowError(new RefundCalculationError("invalid_refund_balance"))
  })

  it("rejects a total overflow when individually valid fees exceed the storage bound", () => {
    // Given
    const history = ["child-a", "child-b"].map((lineId) => ({ lineId, paidFen: 4_294_967_295, refundedFen: 0, reservedFen: 0 }))
    // When
    const action = () => calculateParticipantRefund(history, ["child-a", "child-b"])
    // Then
    expect(action).toThrowError(new RefundCalculationError("invalid_refund_balance"))
  })
})
