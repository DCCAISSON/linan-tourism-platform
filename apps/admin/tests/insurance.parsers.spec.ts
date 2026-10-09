import { describe, expect, it } from "vitest"
import { ApiError } from "@/api/configuration.errors"
import { parseInsuranceBatch, parseInsuranceDiff, parseSessionInsurancePlan } from "@/api/insurance.parsers"

const validBatch = {
  id: "batch-1",
  tourSessionId: "session-1",
  organizationId: "school-1",
  rosterVersion: "version-1",
  status: "submitted",
  companyTemplateName: null,
  submittedAt: "2026-09-23T08:00:00.000Z",
  createdAt: "2026-09-23T07:00:00.000Z",
  people: [{
    id: "person-1",
    personRef: "paid:line-1",
    displayName: "测试学生",
    className: "一班",
    identityMasked: "330100********1234",
    phoneMasked: "139****0000",
    status: "submitted",
    issueCode: null,
    policyNumber: null,
    receiptReference: "receipt-1",
    coverageStart: null,
    coverageEnd: null,
  }],
  handoffs: [{
    id: "handoff-1",
    kind: "submitted",
    note: "已送保险公司",
    receiptReference: "receipt-1",
    createdAt: "2026-09-23T08:00:00.000Z",
  }],
} as const

describe("insurance response boundary", () => {
  it("keeps the batch plan separate from the current plan and permits legacy batches", () => {
    const plan = { insurerName: "保险公司", planName: "一日出行方案", coverageSummary: "保障内容", notice: null }
    expect(parseSessionInsurancePlan({ tourSessionId: "session-1", plan }).plan).toEqual(plan)
    expect(parseInsuranceBatch({ ...validBatch, planSnapshot: plan }).planSnapshot).toEqual(plan)
    expect(parseInsuranceBatch(validBatch).planSnapshot).toBeNull()
    expect(parseInsuranceBatch({ ...validBatch, planSnapshot: null }).planSnapshot).toBeNull()
  })

  it("distinguishes missing or malformed plan data from a deliberately unconfigured plan", () => {
    expect(parseSessionInsurancePlan({ tourSessionId: "session-1", plan: null }).plan).toBeNull()
    expect(() => parseSessionInsurancePlan({ tourSessionId: "session-1" })).toThrow(ApiError)
    expect(() => parseSessionInsurancePlan({ tourSessionId: "session-1", plan: { insurerName: "公司" } })).toThrow(ApiError)
    expect(() => parseInsuranceBatch({ ...validBatch, planSnapshot: "invalid" })).toThrow(ApiError)
  })

  it("keeps roster version, people status, and handoff receipt references", () => {
    const parsed = parseInsuranceBatch(validBatch)

    expect(parsed.rosterVersion).toBe("version-1")
    expect(parsed.people[0]?.status).toBe("submitted")
    expect(parsed.handoffs[0]?.receiptReference).toBe("receipt-1")
  })

  it("rejects malformed people arrays instead of treating them as empty", () => {
    const response = { ...validBatch, people: "[]" }

    expect(() => parseInsuranceBatch(response)).toThrow(ApiError)
  })

  it("parses roster differences for the change handoff panel", () => {
    const parsed = parseInsuranceDiff({
      rosterChanged: true,
      currentRosterVersion: "version-2",
      addedRefs: ["paid:new"],
      removedRefs: ["paid:old"],
      changedRefs: ["imported:teacher"],
    })

    expect(parsed.addedRefs).toEqual(["paid:new"])
    expect(parsed.rosterChanged).toBe(true)
  })
})
