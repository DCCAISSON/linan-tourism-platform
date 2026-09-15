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
  it("keeps review disabled when required family enrollment fields are incomplete", () => {
    const draft = createEmptyDraft()

    const readiness = readEnrollmentReadiness(draft)

    expect(readiness).toEqual({ ready: false, reason: "请选择学校、年级和班级" })
  })

  it("builds the schema-aligned enrollment payload after review consent is accepted", () => {
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
        { id: "local-a", code: "member-a", displayName: "成员甲", selected: true },
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
        code: "member-a",
        displayName: "成员甲",
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

  it("reuses saved member ids when enrollment submission is retried", async () => {
    const member: FamilyMember = { id: "local-a", code: "member-a", displayName: "成员甲", selected: true }
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
