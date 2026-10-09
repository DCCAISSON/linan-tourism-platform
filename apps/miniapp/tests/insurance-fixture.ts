export const insurancePlan = {
  insurerName: "承保公司甲",
  planName: "研学出行保障方案",
  coverageSummary: "意外伤害及意外医疗保障。\n保障责任与限额以保单为准。",
  notice: "请留意保单载明的保障范围。",
} as const

export const insuranceRecord = {
  batchId: "batch-2",
  batchStatus: "insured",
  status: "insured",
  planSnapshot: { ...insurancePlan, planName: "办理时的保障方案" },
  policyNumber: "POLICY-FIXTURE-2",
  coverageStart: "2026-10-12",
  coverageEnd: "2026-10-13",
  createdAt: "2026-10-09T08:00:00.000Z",
  submittedAt: "2026-10-09T09:00:00.000Z",
} as const

export const familyInsurance = {
  orderId: "order-1",
  tourSessionId: "session-1",
  currentPlan: insurancePlan,
  people: [{ orderLineId: "line-1", displayName: "参加人甲", refundStatus: "none", records: [insuranceRecord] }],
} as const
