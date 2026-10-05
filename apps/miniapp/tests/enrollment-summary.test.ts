import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { describe, expect, it, vi } from "vitest"
import * as validation from "../src/enrollment-validation"
import * as flow from "../src/enrollment-flow"

function setup(name: string, page: object, scroll = vi.fn()) {
  const { descriptor } = parse(readFileSync(new URL(`../src/pages/index/${name}.vue`, import.meta.url), "utf8"))
  const compiled = compileScript(descriptor, { id: name })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(code, { exports, uni: { pageScrollTo: scroll }, require: (module: string) => {
    if (module === "vue") return vue
    if (module.endsWith("enrollment-validation")) return validation
    if (module.endsWith("enrollment-flow")) return flow
    return {}
  } })
  return (exports["default"] as { setup: (props: object, context: object) => {
    collapseMember: (member: flow.FamilyMember) => void
    canCollapse: (member: flow.FamilyMember) => boolean
    isMemberCollapsed: (member: flow.FamilyMember) => boolean
    expandMember: (member: flow.FamilyMember) => void
    memberProfileStatus: (member: flow.FamilyMember) => string
    memberHealthStatus: (member: flow.FamilyMember) => string
    hasNewStudent: vue.ComputedRef<boolean>
    startEditing: (member: flow.FamilyMember) => void
    estimatedAmount: vue.ComputedRef<string>
    adultCount: vue.ComputedRef<number>
    studentCount: vue.ComputedRef<number>
    editSection: (anchor: string) => Promise<void>
  } }).setup({ page }, { expose: vi.fn() })
}

function memberFixture() {
  const member = vue.reactive<flow.FamilyMember>({ id: "demo", code: "demo", displayName: "演示成人", participantKind: "adult", identityNumber: "11010519491231002X", selected: true, healthNotes: "演示备注", healthConsent: true, saveAsCommon: true })
  const validationShown = vue.ref(false)
  const page = { draft: vue.reactive({ familyMembers: [member] }), memberToEdit: vue.ref<string | null>(null), memberFieldError: (person: flow.FamilyMember, field: validation.MemberFieldName) => validationShown.value ? validation.readMemberFieldError(person, field) ?? "" : "" }
  return { member, validationShown, page }
}

describe("enrollment participant summaries", () => {
  it("collapses only on explicit completion and keeps identity, health and consent intact", () => {
    const { member, page } = memberFixture()
    const component = setup("EnrollmentMembersSection", page)
    expect(component.isMemberCollapsed(member)).toBe(false)
    component.collapseMember(member)
    expect(component.isMemberCollapsed(member)).toBe(true)
    expect(member).toMatchObject({ identityNumber: "11010519491231002X", healthNotes: "演示备注", healthConsent: true, saveAsCommon: true, selected: true })
  })

  it("keeps a new incomplete participant expanded", () => {
    const { member, page } = memberFixture()
    member.identityNumber = ""
    const component = setup("EnrollmentMembersSection", page)
    component.collapseMember(member)
    expect(component.isMemberCollapsed(member)).toBe(false)
  })

  it("expands an invalid collapsed participant and stays expanded after correcting the field", async () => {
    const { member, page, validationShown } = memberFixture()
    const component = setup("EnrollmentMembersSection", page)
    component.collapseMember(member)
    member.identityNumber = "invalid"
    validationShown.value = true
    await vue.nextTick()
    expect(component.isMemberCollapsed(member)).toBe(false)
    member.identityNumber = "11010519491231002X"
    await vue.nextTick()
    expect(component.isMemberCollapsed(member)).toBe(false)
  })

  it("does not collapse while a saved name is being edited", () => {
    const { member, page } = memberFixture()
    member.remoteMemberId = "saved"
    const component = setup("EnrollmentMembersSection", page)
    component.startEditing(member)
    component.collapseMember(member)
    expect(component.isMemberCollapsed(member)).toBe(false)
  })

  it("starts saved members as summaries and preserves an explicit edit while data changes", async () => {
    // Given
    const { member, page } = memberFixture()
    Object.assign(member, { fromCommonList: true, remoteMemberId: "saved", selected: false })
    const component = setup("EnrollmentMembersSection", page)
    expect(component.isMemberCollapsed(member)).toBe(true)
    // When
    component.expandMember(member)
    member.selected = true
    member.healthNotes = "本次补充"
    await vue.nextTick()
    // Then
    expect(component.isMemberCollapsed(member)).toBe(false)
    expect(member.healthConsent).toBe(true)
  })

  it("shows an asynchronously loaded saved member as a summary but keeps a one-time uploaded member open", async () => {
    // Given
    const { member, page } = memberFixture()
    member.remoteMemberId = "uploaded-during-retry"
    const component = setup("EnrollmentMembersSection", page)
    const saved = { ...member, id: "saved-later", remoteMemberId: "saved-later", fromCommonList: true }
    // When
    page.draft.familyMembers.push(saved)
    await vue.nextTick()
    // Then
    expect(component.isMemberCollapsed(saved)).toBe(true)
    expect(component.isMemberCollapsed(member)).toBe(false)
  })

  it("opens the member requested from review after the form remounts", () => {
    // Given
    const { member, page } = memberFixture()
    Object.assign(member, { fromCommonList: true, remoteMemberId: "saved" })
    page.memberToEdit.value = member.id
    // When
    const component = setup("EnrollmentMembersSection", page)
    // Then
    expect(component.isMemberCollapsed(member)).toBe(false)
    expect(page.memberToEdit.value).toBeNull()
  })

  it("opens an invalid saved summary without changing the selected person", async () => {
    // Given
    const { member, page, validationShown } = memberFixture()
    Object.assign(member, { fromCommonList: true, remoteMemberId: "saved", displayName: "" })
    const component = setup("EnrollmentMembersSection", page)
    // When
    validationShown.value = true
    await vue.nextTick()
    // Then
    expect(component.isMemberCollapsed(member)).toBe(false)
    expect(member.selected).toBe(true)
  })

  it("states only known name and identity completeness and keeps the adult phone optional", () => {
    // Given
    const { member, page } = memberFixture()
    const component = setup("EnrollmentMembersSection", page)
    member.phone = ""
    // When / Then
    expect(component.memberProfileStatus(member)).toBe("姓名、证件已填写")
    member.identityNumber = ""
    expect(component.memberProfileStatus(member)).toBe("证件待完善")
    member.displayName = ""
    expect(component.memberProfileStatus(member)).toBe("姓名、证件待完善")
  })

  it("keeps health status specific to each person and distinguishes missing notes from absent authorization", () => {
    // Given
    const { member, page } = memberFixture()
    const component = setup("EnrollmentMembersSection", page)
    const other = { ...member, id: "other", healthNotes: "  ", healthConsent: false }
    // When / Then
    expect(component.memberHealthStatus(other)).toBe("未填写（选填）")
    expect(component.memberHealthStatus(member)).toBe("已填写，已单独授权本次保存")
    member.healthConsent = false
    expect(component.memberHealthStatus(member)).toBe("已填写，未授权提交")
  })
})

describe("enrollment placement inputs", () => {
  it("shows grade and class inputs only for a selected new student", () => {
    const { member, page } = memberFixture()
    const component = setup("EnrollmentForm", page)
    expect(component.hasNewStudent.value).toBe(false)
    member.participantKind = "student"
    expect(component.hasNewStudent.value).toBe(true)
    member.selected = false
    expect(component.hasNewStudent.value).toBe(false)
    Object.assign(member, { selected: true, remoteMemberId: "saved", fromCommonList: true })
    expect(component.hasNewStudent.value).toBe(false)
  })
})

describe("enrollment review groups", () => {
  it("separates adults and students without changing the shared per-person total", () => {
    // Given: older saved students may not yet carry participantKind.
    const selectedMembers = vue.ref([{ participantKind: "adult" }, { participantKind: "student" }, {}])
    const component = setup("EnrollmentReview", { selectedSession: vue.ref({ priceFen: 19500 }), selectedMembers })
    // When / Then: the review explains every selected participant exactly once.
    expect(component.adultCount.value).toBe(1)
    expect(component.studentCount.value).toBe(2)
    expect(component.estimatedAmount.value).toBe("¥585.00")
    selectedMembers.value.shift()
    expect(component.adultCount.value).toBe(0)
    expect(component.studentCount.value).toBe(2)
    expect(component.estimatedAmount.value).toBe("¥390.00")
  })
  it("calculates the exact current price times selected people", () => {
    const selectedMembers = vue.ref([{}, {}])
    const page = { selectedSession: vue.ref({ priceFen: 12345 }), selectedMembers }
    const component = setup("EnrollmentReview", page)
    expect(component.estimatedAmount.value).toBe("¥246.90")
    selectedMembers.value.pop()
    expect(component.estimatedAmount.value).toBe("¥123.45")
  })

  it.each(["enrollment-school-field", "enrollment-session-field", "enrollment-members-field", "enrollment-member-demo-displayName", "enrollment-contact-name-field", "enrollment-emergency-field", "enrollment-agreement-field"])("returns to editing before scrolling to %s", async (anchor) => {
    const scroll = vi.fn()
    const backToEdit = vi.fn()
    const component = setup("EnrollmentReview", { backToEdit }, scroll)
    const pending = component.editSection(anchor)
    expect(backToEdit).toHaveBeenCalledOnce()
    expect(scroll).not.toHaveBeenCalled()
    await pending
    expect(scroll).toHaveBeenCalledWith({ selector: `#${anchor}`, duration: 200 })
  })
})
