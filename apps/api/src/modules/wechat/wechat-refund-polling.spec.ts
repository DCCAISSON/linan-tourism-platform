import { describe, expect, it } from "vitest"
import { refundPollDue, refundPollIntervalMs } from "./wechat-refund-polling.service.js"

const minute = 60_000

describe("微信退款状态轮询", () => {
  it.each([
    [minute, minute],
    [5 * minute, minute],
    [6 * minute, 5 * minute],
    [31 * minute, 10 * minute],
    [61 * minute, 20 * minute],
    [121 * minute, 30 * minute],
  ])("按退款时长逐步降低查询频率", (ageMs, expected) => {
    expect(refundPollIntervalMs(ageMs)).toBe(expected)
  })

  it("只查询已经达到下一次查询时间的处理中退款", () => {
    const now = new Date("2026-09-28T12:10:00.000Z")
    expect(refundPollDue({
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
      updatedAt: new Date("2026-09-28T12:04:59.000Z"),
    }, now)).toBe(true)
    expect(refundPollDue({
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
      updatedAt: new Date("2026-09-28T12:05:01.000Z"),
    }, now)).toBe(false)
  })
})
