export const confirmedPerson = { personRef: "paid:line-1", displayName: "学生甲", participantKind: "student", importedRole: null, gradeName: "一年级", className: "一班", vehicleId: "vehicle-1", vehicleSequence: 1 }
export const groupPerson = { ...confirmedPerson, personRef: "paid:line-2", displayName: "学生乙", vehicleId: "vehicle-2", vehicleSequence: 2 }
export const guideSession = {
  id: "session-1", code: "研学团", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-02T00:00:00Z", vehicleIds: ["vehicle-1"],
  confirmationStatus: "current", vehicles: [{ id: "vehicle-1", sequence: 1, plateNumber: "浙A00001" }, { id: "vehicle-2", sequence: 2, plateNumber: "浙A00002" }],
  people: [{ ...confirmedPerson, active: true, inactiveReason: null, attendance: null, healthAuthorized: false }], groupPeople: [confirmedPerson, groupPerson], dailyReports: [], events: [],
}
export const managementSession = {
  ...guideSession, people: [{ ...confirmedPerson, attendance: null }, { ...groupPerson, attendance: null }], personDailyReports: [{ id: "daily-1", personRef: "paid:line-1", displayName: "学生甲", reportDate: "2026-10-01", lodgingCheck: "入住完成", mealStatus: "正常用餐", publicSummary: "", publicApproved: false, version: 2, updatedAt: "2026-10-01T09:00:00Z" }],
  counts: { present: 0, absent: 0, revoked: 0, unrecorded: 2, personDailyReports: 1, approvedPersonDailyReports: 0, events: 0 },
}
