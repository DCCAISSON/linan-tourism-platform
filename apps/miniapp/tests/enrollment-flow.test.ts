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
      policyVersion: DOMAIN_POLICY_VERSION,
    },
  ],
}

describe("enrollment flow state", () => {
  it("reuses existing family members without asking to reassign their class", async () => {
    // Given
    const draft: EnrollmentDraft = {
      ...createEmptyDraft(), selectedSchoolId: "org-school-1", selectedTourSessionId: "session-1",
      contactName: "演示家长", emergencyContact: { name: "演示联系人", phone: "10000000000" }, agreementAccepted: true,
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
      emergencyContact: {
        name: "备用联系人",
        phone: "10000000000",
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
          phone: virtualPhone("3011"),
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
        phone: virtualPhone("3011"),
      },
    ])
    expect(payload).toEqual({
      tourSessionId: "session-1",
      memberIds: ["member-real-a"],
      contactName: "家长联系人",
      emergencyContactName: "备用联系人",
      emergencyContactPhone: "10000000000",
      agreementVersion: FAMILY_ENROLLMENT_AGREEMENT_VERSION,
      schemaVersion: DOMAIN_SCHEMA_VERSION,
    })
  })

  it("builds adult and student member payloads while requiring class placement only for students", () => {
    const studentIdentityNumber = virtualResidentId("20100101", "005")
    const adultIdentityNumber = virtualResidentId("19800101", "007")
    const draft: EnrollmentDraft = {
      contactName: "Family Contact",
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
          phone: virtualPhone("3001"),
        },
        {
          id: "local-adult",
          code: "adult-a",
          displayName: "Virtual Adult",
          selected: true,
          participantKind: "adult",
          identityNumber: adultIdentityNumber,
          phone: virtualPhone("3002"),
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
        phone: virtualPhone("3001"),
        tourSessionId: "session-1",
      },
      {
        code: "adult-a",
        displayName: "Virtual Adult",
        participantKind: "adult",
        identityNumber: adultIdentityNumber,
        phone: virtualPhone("3002"),
        tourSessionId: "session-1",
      },
    ])
  })

  it("allows an adult-only local signup without a selected school", () => {
    const adultIdentityNumber = virtualResidentId("19800101", "009")
    const draft: EnrollmentDraft = {
      contactName: "Family Contact",
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

    expect(readEnrollmentReadiness(draft)).toEqual({ ready: false, reason: "请填写证件号码和联系电话" })
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
      emergencyContact: {
        name: "备用联系人",
        phone: "10000000000",
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
