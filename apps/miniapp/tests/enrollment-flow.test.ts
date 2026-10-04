import {
  DOMAIN_POLICY_VERSION,
  DOMAIN_SCHEMA_VERSION,
} from "@linan/contracts"
import { describe, expect, it } from "vitest"
import { FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "../src/api"
import {
  buildEnrollmentPayload,
  buildSelectedMemberPayloads,
  createEmptyDraft,
  prepareSelectedMembersForSubmit,
  readEnrollmentReadiness,
  type FamilyMember,
  type CatalogState,
  type EnrollmentDraft,
} from "../src/enrollment-flow"

const catalog: CatalogState = {
  schools: [{ id: "org-school-1", code: "school-1", name: "测试学校" }],
  grades: [{ id: "grade-1", organizationId: "org-school-1", code: "grade-1", name: "一年级" }],
  classes: [{ id: "class-1", gradeId: "grade-1", code: "class-1", name: "一班" }],
  sessions: [
    {
      id: "session-1",
      organizationId: "org-school-1",
      catalogItemId: "catalog-1",
      code: "session-1",
      status: "published",
      priceFen: 12_300,
      capacity: 30,
      startsAt: "2026-10-03T01:00:00.000Z",
      endsAt: "2026-10-03T09:00:00.000Z",
      enrollmentOpensAt: "2026-09-20T01:00:00.000Z",
      enrollmentClosesAt: "2026-10-01T09:00:00.000Z",
      activeNoticeId: "notice-1",
      activeNotice: {
        id: "notice-1",
        organizationId: "org-school-1",
        tourSessionId: "session-1",
        version: "v1",
        title: "[演示]大明山地质研学告知书 v1",
        createdAt: "2026-09-22T00:00:00.000Z",
        contentJson: {
          destination: "[演示]大明山地质研学",
          departurePlace: "[演示]临安旅游集散中心门口",
          mealNote: "[演示]含午餐，特殊餐食由家长提前备注",
          itinerary: ["[演示]1", "[演示]2", "[演示]3", "[演示]4", "[演示]5", "[演示]6", "[演示]7"],
          unitPrices: ["[演示]学生195元/人", "[演示]成人195元/人"],
          packageExamples: ["[演示]1名学生+1名成人390元"],
          reminders: ["[演示]请携带身份证件"],
        },
      },
      policyVersion: DOMAIN_POLICY_VERSION,
    },
  ],
}

describe("enrollment flow state", () => {
  it("reuses existing family members without asking to reassign their class", async () => {
    // Given
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(), selectedSchoolId: "org-school-1", selectedTourSessionId: "session-1",
      contactPhone: virtualPhone("3099"), emergencySameAsParent: false,
      contactName: "演示家长", emergencyContact: { name: "演示联系人", phone: virtualPhone("3000") }, agreementAccepted: true,
      familyMembers: [
        { id: "member-a", remoteMemberId: "member-a", code: "child-a", displayName: "演示甲", selected: true },
        { id: "member-b", remoteMemberId: "member-b", code: "child-b", displayName: "演示乙", selected: true },
      ],
    }
    let createCalls = 0
    // When
    const ids = await prepareSelectedMembersForSubmit(draft, async () => { createCalls += 1; return { id: "unexpected-new-member" } })
    // Then
    expect(ids).toEqual(["member-a", "member-b"])
    expect(createCalls).toBe(0)
  })

  it("keeps review disabled when required family enrollment fields are incomplete", () => {
    const draft = createEmptyDraft()

    const readiness = readEnrollmentReadiness(draft)

    expect(readiness).toEqual({ ready: false, reason: "请选择学校、年级和班级" })
  })

  it("builds the schema-aligned enrollment payload after review consent is accepted", () => {
    const studentIdentityNumber = virtualResidentId("20100101", "003")
    const draft: EnrollmentDraft = {
      contactName: "家长联系人",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: {
        name: "备用联系人",
        phone: virtualPhone("3008"),
      },
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-a",
          code: "member-a",
          displayName: "成员甲",
          selected: true,
          participantKind: "student",
          identityNumber: studentIdentityNumber,
          phone: virtualPhone("3099"),
        saveAsCommon: false,
        },
        { id: "local-b", code: "member-b", displayName: "成员乙", selected: false },
      ],
    }

    const memberPayloads = buildSelectedMemberPayloads(draft)
    const payload = buildEnrollmentPayload(draft, catalog, ["member-real-a"])

    expect(memberPayloads).toEqual([
      {
        schoolId: "org-school-1",
        gradeId: "grade-1",
        classId: "class-1",
        tourSessionId: "session-1",
        code: "member-a",
        displayName: "成员甲",
        participantKind: "student",
        identityNumber: studentIdentityNumber,
        phone: virtualPhone("3099"),
        saveAsCommon: false,
      },
    ])
    expect(payload).toEqual({
      tourSessionId: "session-1",
      memberIds: ["member-real-a"],
      contactName: "家长联系人",
      contactPhone: virtualPhone("3099"),
      emergencyContactName: "备用联系人",
      emergencyContactPhone: virtualPhone("3008"),
      agreementVersion: FAMILY_ENROLLMENT_AGREEMENT_VERSION,
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      noticeVersionId: "notice-1",
      noticeVersion: "v1",
    })
  })

  it("builds adult and student member payloads while requiring class placement only for students", () => {
    const studentIdentityNumber = virtualResidentId("20100101", "005")
    const adultIdentityNumber = virtualResidentId("19800101", "007")
    const draft: EnrollmentDraft = {
      contactName: "Family Contact",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: {
        name: "Emergency Contact",
        phone: virtualPhone("3003"),
      },
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-student",
          code: "student-a",
          displayName: "Virtual Student",
          selected: true,
          participantKind: "student",
          identityNumber: studentIdentityNumber,
          phone: virtualPhone("3099"),
        saveAsCommon: false,
        },
        {
          id: "local-adult",
          code: "adult-a",
          displayName: "Virtual Adult",
          selected: true,
          participantKind: "adult",
          identityNumber: adultIdentityNumber,
          phone: virtualPhone("3002"),
        saveAsCommon: false,
        },
      ],
    }

    const payloads = buildSelectedMemberPayloads(draft)

    expect(payloads).toEqual([
      {
        schoolId: "org-school-1",
        gradeId: "grade-1",
        classId: "class-1",
        code: "student-a",
        displayName: "Virtual Student",
        participantKind: "student",
        identityNumber: studentIdentityNumber,
        phone: virtualPhone("3099"),
        saveAsCommon: false,
        tourSessionId: "session-1",
      },
      {
        code: "adult-a",
        displayName: "Virtual Adult",
        participantKind: "adult",
        identityNumber: adultIdentityNumber,
        phone: virtualPhone("3002"),
        saveAsCommon: false,
        tourSessionId: "session-1",
      },
    ])
  })

  it("allows an adult-only local signup without a selected school", () => {
    const adultIdentityNumber = virtualResidentId("19800101", "009")
    const draft: EnrollmentDraft = {
      contactName: "Family Contact",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: {
        name: "Emergency Contact",
        phone: virtualPhone("3004"),
      },
      selectedSchoolId: "",
      selectedGradeId: "",
      selectedClassId: "",
      selectedTourSessionId: "session-1",
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-adult",
          code: "adult-a",
          displayName: "Virtual Adult",
          selected: true,
          participantKind: "adult",
          identityNumber: adultIdentityNumber,
          phone: virtualPhone("3005"),
        saveAsCommon: false,
        },
      ],
    }

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: true })
    expect(buildSelectedMemberPayloads(draft)).toEqual([
      {
        code: "adult-a",
        displayName: "Virtual Adult",
        participantKind: "adult",
        identityNumber: adultIdentityNumber,
        phone: virtualPhone("3005"),
        saveAsCommon: false,
        tourSessionId: "session-1",
      },
    ])
  })

  it("keeps local member submission disabled until identity fields are filled", () => {
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(),
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      contactName: "Family Contact",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: { name: "Emergency Contact", phone: virtualPhone("3006") },
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-a",
          code: "member-a",
          displayName: "Virtual Student",
          selected: true,
          participantKind: "student",
          identityNumber: "",
          phone: virtualPhone("3007"),
        },
      ],
    }

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写参加人的证件号码" })
  })

  it("requires a selected member name before review", () => {
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(),
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      contactName: "Family Contact",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: { name: "Emergency Contact", phone: virtualPhone("3008") },
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-a",
          code: "member-a",
          displayName: "",
          selected: true,
          participantKind: "student",
          identityNumber: virtualResidentId("20100101", "013"),
          phone: virtualPhone("3009"),
        },
      ],
    }

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写参加人姓名" })
  })

  it("requires valid mainland identity and mobile formats for new members", () => {
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(),
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      contactName: "Family Contact",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: { name: "Emergency Contact", phone: virtualPhone("3010") },
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-a",
          code: "member-a",
          displayName: "Virtual Student",
          selected: true,
          participantKind: "adult",
          identityNumber: "110105201001010031",
          phone: "12000000000",
        },
      ],
    }

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写有效的证件号码" })

    const [member] = draft.familyMembers
    if (member === undefined) throw new Error("missing member fixture")
    member.identityNumber = virtualResidentId("20100101", "013")

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写有效的联系电话" })
  })

  it("does not require families to fill a member code", () => {
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(),
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      contactName: "Family Contact",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: { name: "Emergency Contact", phone: virtualPhone("3013") },
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-a",
          code: "",
          displayName: "Virtual Student",
          selected: true,
          participantKind: "student",
          identityNumber: virtualResidentId("20100101", "015"),
          phone: virtualPhone("3014"),
        },
      ],
    }

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: true })
  })

  it("asks for the selected participant name before submit", () => {
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(),
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      contactName: "家长联系人",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: { name: "备用联系人", phone: virtualPhone("3013") },
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-a",
          code: "",
          displayName: "",
          selected: true,
          participantKind: "student",
          identityNumber: virtualResidentId("20100101", "013"),
          phone: virtualPhone("3014"),
        },
      ],
    }

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写参加人姓名" })
  })

  it("generates an internal member code when the public form only collects a name", () => {
    const draft: EnrollmentDraft = {
      contactName: "家长联系人",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: {
        name: "备用联系人",
        phone: virtualPhone("3015"),
      },
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-member-20260926-1",
          code: "",
          displayName: "学生甲",
          selected: true,
          participantKind: "student",
          identityNumber: virtualResidentId("20100101", "015"),
          phone: virtualPhone("3016"),
        },
      ],
    }

    const [payload] = buildSelectedMemberPayloads(draft)
    if (payload === undefined) throw new Error("missing member payload")
    expect(payload.code).toBe("lm-calmember202609261")
  })

  it("requires phone and identity formats that can be used for enrollment contact and insurance", () => {
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(),
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      contactName: "家长联系人",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: { name: "备用联系人", phone: virtualPhone("3017") },
      agreementAccepted: true,
      familyMembers: [
        {
          id: "local-a",
          code: "",
          displayName: "学生甲",
          selected: true,
          participantKind: "student",
          identityNumber: "123456201001010010",
          phone: virtualPhone("3019"),
        },
      ],
    }

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写有效的证件号码" })

    const [member] = draft.familyMembers
    if (member === undefined) throw new Error("missing member fixture")
    member.identityNumber = virtualResidentId("20100101", "017")
    member.participantKind = "adult"
    member.phone = "12345"
    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写有效的联系电话" })
  })

  it("reuses saved member ids when enrollment submission is retried", async () => {
    const member: FamilyMember = {
      id: "local-a",
      code: "member-a",
      displayName: "成员甲",
      selected: true,
      participantKind: "student",
      identityNumber: virtualResidentId("20100101", "011"),
      phone: virtualPhone("3012"),
    }
    const draft: EnrollmentDraft = {
      contactName: "家长联系人",
      contactPhone: virtualPhone("3099"),
      emergencySameAsParent: false,
      emergencyContact: {
        name: "备用联系人",
        phone: virtualPhone("3018"),
      },
      selectedSchoolId: "org-school-1",
      selectedGradeId: "grade-1",
      selectedClassId: "class-1",
      selectedTourSessionId: "session-1",
      agreementAccepted: true,
      familyMembers: [member],
    }
    let createCalls = 0
    const createMember = async () => {
      createCalls += 1
      return { id: "member-real-a" }
    }

    const firstAttempt = await prepareSelectedMembersForSubmit(draft, createMember)
    const secondAttempt = await prepareSelectedMembersForSubmit(draft, createMember)

    expect(firstAttempt).toEqual(["member-real-a"])
    expect(secondAttempt).toEqual(["member-real-a"])
    expect(createCalls).toBe(1)
  })
})


function virtualPhone(sequence: string): string {
  return `1990000${sequence.padStart(4, "0")}`
}

function virtualResidentId(birthDate: string, sequence: string): string {
  const body = `999999${birthDate}${sequence}`
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const
  const checkCodes = "10X98765432"
  let sum = 0
  for (const [index, weight] of weights.entries()) {
    sum += Number(body[index] ?? "0") * weight
  }
  return `${body}${checkCodes[sum % 11] ?? "0"}`
}


describe("simplified enrollment contacts and participant consent", () => {
  function readyDraft(): EnrollmentDraft {
    return { ...createEmptyDraft(), selectedSchoolId: "org-school-1", selectedGradeId: "grade-1", selectedClassId: "class-1", selectedTourSessionId: "session-1", contactName: "家长甲", contactPhone: "19900003099", agreementAccepted: true,
      familyMembers: [{ id: "child", code: "child", displayName: "学生甲", participantKind: "student", identityNumber: "110105201001010010", selected: true }] }
  }
  it("uses the parent phone for a student and emergency contact when same-parent is selected", () => {
    // Given
    const draft = readyDraft()
    // When
    const members = buildSelectedMemberPayloads(draft)
    const enrollment = buildEnrollmentPayload(draft, catalog, ["child"])
    // Then
    expect(members[0]).toMatchObject({ phone: draft.contactPhone, saveAsCommon: false })
    expect(enrollment).toMatchObject({ contactPhone: draft.contactPhone, emergencyContactName: draft.contactName, emergencyContactPhone: draft.contactPhone })
  })
  it("saves a common participant only after explicit opt-in", () => {
    // Given
    const draft = readyDraft()
    const member = draft.familyMembers[0]
    if (member === undefined) throw new Error("missing fixture member")
    member.saveAsCommon = true
    // When
    const payloads = buildSelectedMemberPayloads(draft)
    // Then
    expect(payloads[0]?.saveAsCommon).toBe(true)
  })
  it("accepts an adult without a separate phone and uses the parent contact", () => {
    // Given
    const draft = readyDraft()
    const member = draft.familyMembers[0]
    if (member === undefined) throw new Error("missing fixture member")
    member.participantKind = "adult"
    // When
    const payloads = buildSelectedMemberPayloads(draft)
    // Then
    expect(payloads[0]?.phone).toBe(draft.contactPhone)
  })
  it("requires the other emergency contact only when the parent chooses that option", () => {
    // Given
    const draft = { ...readyDraft(), emergencySameAsParent: false }
    // When
    const result = readEnrollmentReadiness(draft)
    // Then
    expect(result).toEqual({ ready: false, reason: "请填写紧急联系人姓名" })
  })
})
