import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createEmptyDraft, type EnrollmentDraft } from "../src/enrollment-flow"
import { memberFieldAnchor, readFirstEnrollmentInvalidTarget } from "../src/enrollment-validation"
import { scrollToEnrollmentAnchor } from "../src/pages/index/useEnrollmentPage"

const enrollmentFormTemplate = readFileSync(new URL("../src/pages/index/EnrollmentForm.vue", import.meta.url), "utf8")

function validDraft(): EnrollmentDraft {
  return {
    ...createEmptyDraft(),
    selectedSchoolId: "school-1",
    selectedGradeId: "grade-1",
    selectedClassId: "class-1",
    selectedTourSessionId: "session-1",
    contactName: "家长联系人",
    contactPhone: "19900003001",
    emergencySameAsParent: false,
    emergencyContact: { name: "紧急联系人", phone: "19900003001" },
    agreementAccepted: true,
    familyMembers: [
      {
        id: "local member/1",
        code: "member-code-1",
        displayName: "学生甲",
        participantKind: "student",
        identityNumber: "110105201001010010",
        phone: "19900003002",
        selected: true,
      },
    ],
  }
}

type InvalidAnchorScenario = {
  readonly name: string
  readonly expectedAnchor: string
  readonly expectedTemplateToken: string
  readonly createDraft: () => EnrollmentDraft
}

function draftWithMember(changeMember: (draft: EnrollmentDraft) => void): EnrollmentDraft {
  const draft = validDraft()
  changeMember(draft)
  return draft
}

function validMember() {
  const member = validDraft().familyMembers[0]
  if (member === undefined) throw new Error("missing fixture member")
  return member
}

const invalidAnchorScenarios: readonly InvalidAnchorScenario[] = [
  {
    name: "school selector",
    expectedAnchor: "enrollment-school-field",
    expectedTemplateToken: 'id="enrollment-school-field"',
    createDraft: () => createEmptyDraft(),
  },
  {
    name: "grade selector",
    expectedAnchor: "enrollment-grade-field",
    expectedTemplateToken: 'id="enrollment-grade-field"',
    createDraft: () => ({ ...validDraft(), selectedGradeId: "" }),
  },
  {
    name: "class selector",
    expectedAnchor: "enrollment-class-field",
    expectedTemplateToken: 'id="enrollment-class-field"',
    createDraft: () => ({ ...validDraft(), selectedClassId: "" }),
  },
  {
    name: "tour session selector",
    expectedAnchor: "enrollment-session-field",
    expectedTemplateToken: 'id="enrollment-session-field"',
    createDraft: () => ({ ...validDraft(), selectedTourSessionId: "" }),
  },
  {
    name: "member section",
    expectedAnchor: "enrollment-members-field",
    expectedTemplateToken: 'id="enrollment-members-field"',
    createDraft: () => ({ ...validDraft(), familyMembers: [{ ...validMember(), selected: false }] }),
  },
  {
    name: "member name field",
    expectedAnchor: memberFieldAnchor("local member/1", "displayName"),
    expectedTemplateToken: `:id="memberFieldAnchor(member.id, 'displayName')"`,
    createDraft: () => draftWithMember((draft) => {
      const member = draft.familyMembers[0]
      if (member !== undefined) member.displayName = ""
    }),
  },
  {
    name: "member identity field",
    expectedAnchor: memberFieldAnchor("local member/1", "identityNumber"),
    expectedTemplateToken: `:id="memberFieldAnchor(member.id, 'identityNumber')"`,
    createDraft: () => draftWithMember((draft) => {
      const member = draft.familyMembers[0]
      if (member !== undefined) member.identityNumber = ""
    }),
  },
  {
    name: "member phone field",
    expectedAnchor: memberFieldAnchor("local member/1", "phone"),
    expectedTemplateToken: `:id="memberFieldAnchor(member.id, 'phone')"`,
    createDraft: () => draftWithMember((draft) => {
      const member = draft.familyMembers[0]
      if (member !== undefined) { member.participantKind = "adult"; member.phone = "12345" }
    }),
  },
  {
    name: "parent contact name field",
    expectedAnchor: "enrollment-contact-name-field",
    expectedTemplateToken: 'id="enrollment-contact-name-field"',
    createDraft: () => ({ ...validDraft(), contactName: "" }),
  },
  {
    name: "emergency contact name field",
    expectedAnchor: "enrollment-emergency-name-field",
    expectedTemplateToken: 'id="enrollment-emergency-name-field"',
    createDraft: () => ({ ...validDraft(), emergencyContact: { ...validDraft().emergencyContact, name: "" } }),
  },
  {
    name: "emergency contact phone field",
    expectedAnchor: "enrollment-emergency-phone-field",
    expectedTemplateToken: 'id="enrollment-emergency-phone-field"',
    createDraft: () => ({ ...validDraft(), emergencyContact: { ...validDraft().emergencyContact, phone: "12345" } }),
  },
  {
    name: "agreement field",
    expectedAnchor: "enrollment-agreement-field",
    expectedTemplateToken: 'id="enrollment-agreement-field"',
    createDraft: () => ({ ...validDraft(), agreementAccepted: false }),
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("enrollment invalid field anchors", () => {
  it.each(["7", "张3", "Alice7", "---"])("rejects an invalid parent name %s before submission", (name) => {
    expect(readFirstEnrollmentInvalidTarget({ ...validDraft(), contactName: name })?.anchor).toBe("enrollment-contact-name-field")
  })
  it.each(["张小明", "欧阳明", "Alice Smith", "O'Neil", "Anne-Marie", "阿依·古丽"])("accepts the name %s", (name) => {
    expect(readFirstEnrollmentInvalidTarget({ ...validDraft(), contactName: name })).toBeUndefined()
  })
  it("rejects numeric emergency and participant names at their own fields", () => {
    const draft = validDraft()
    expect(readFirstEnrollmentInvalidTarget({ ...draft, emergencyContact: { ...draft.emergencyContact, name: "7" } })?.anchor).toBe("enrollment-emergency-name-field")
    expect(readFirstEnrollmentInvalidTarget({ ...draft, familyMembers: [{ ...validMember(), displayName: "7" }] })?.anchor).toBe(memberFieldAnchor("local member/1", "displayName"))
  })
  it("points the initial school error to the school selector instead of the page top", () => {
    const target = readFirstEnrollmentInvalidTarget(createEmptyDraft())

    expect(target?.anchor).toBe("enrollment-school-field")
  })

  it("points member field errors to a stable per-field anchor", () => {
    const draft = validDraft()
    const member = draft.familyMembers[0]
    if (member === undefined) throw new Error("missing fixture member")
    member.displayName = ""

    expect(readFirstEnrollmentInvalidTarget(draft)?.anchor).toBe("enrollment-member-local-member-1-displayName")
    expect(memberFieldAnchor("local member/1", "phone")).toBe("enrollment-member-local-member-1-phone")
  })

  it("points contact errors to the exact invalid contact field", () => {
    const draft = validDraft()
    const draftWithInvalidPhone = {
      ...draft,
      emergencyContact: { ...draft.emergencyContact, phone: "12345" },
    }

    expect(readFirstEnrollmentInvalidTarget(draftWithInvalidPhone)?.anchor).toBe("enrollment-emergency-phone-field")
  })

  it.each(invalidAnchorScenarios)("renders and scrolls to the $name anchor", ({ expectedAnchor, expectedTemplateToken, createDraft }) => {
    const target = readFirstEnrollmentInvalidTarget(createDraft())
    const pageScrollTo = vi.fn()
    vi.stubGlobal("uni", { pageScrollTo })

    expect(target?.anchor).toBe(expectedAnchor)
    expect(enrollmentFormTemplate).toContain(expectedTemplateToken)

    scrollToEnrollmentAnchor(expectedAnchor)

    expect(pageScrollTo).toHaveBeenCalledWith({ selector: `#${expectedAnchor}`, duration: 200 })
  })
})
