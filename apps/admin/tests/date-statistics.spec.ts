import { describe, expect, it } from "vitest"
import { parseDateStatistics } from "@/api/date-statistics"

describe("date statistics response", () => {
  const totals = { paidHeadcount: 2, paymentAmountFen: 58500, refundAmountFen: 19500, presentHeadcount: 1, confirmationMissing: 0, attendanceIncomplete: 1 }
  it("retains gross successful payments separately from successful refunds and partial attendance", () => {
    expect(parseDateStatistics({ rows: [], totals }).totals).toEqual(totals)
  })
  it("rejects missing or invalid totals instead of displaying zero", () => {
    expect(() => parseDateStatistics({ rows: [], totals: { ...totals, refundAmountFen: undefined } })).toThrow()
    expect(() => parseDateStatistics({ rows: [], totals: { ...totals, presentHeadcount: -1 } })).toThrow()
  })
})
