import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parseManualResult } from "./insurance.parser.js"

const result = { success: true, receiptReference: "synthetic-receipt", policyNumber: "SYNTHETIC-POLICY", note: "本地合成回执" }

describe("insurance manual result coverage dates", () => {
  it.each([
    { coverageStart: "2026-02-30", coverageEnd: null },
    { coverageStart: null, coverageEnd: "2027-02-29" },
    { coverageStart: "2026-04-31", coverageEnd: null },
    { coverageStart: "2026-13-01", coverageEnd: null },
    { coverageStart: "2026-00-01", coverageEnd: null },
    { coverageStart: null, coverageEnd: "2026-10-00" },
    { coverageStart: "2026-10-14", coverageEnd: "2026-10-13" },
  ])("rejects invalid calendar dates or reversed coverage in case %#", (dates) => {
    const input = { ...result, ...dates }
    const parse = () => parseManualResult(input)
    expect(parse).toThrow(BadRequestException)
  })

  it.each([
    { coverageStart: "2026-10-13", coverageEnd: "2026-10-13" },
    { coverageStart: "2028-02-29", coverageEnd: "2028-03-01" },
    { coverageStart: null, coverageEnd: "2026-10-13" },
    { coverageStart: "2026-10-13", coverageEnd: null },
    { coverageStart: null, coverageEnd: null },
  ])("preserves valid coverage and optional dates in case %#", (dates) => {
    const input = { ...result, ...dates }
    const parsed = parseManualResult(input)
    expect(parsed).toEqual(input)
  })
})
