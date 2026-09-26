import type { EnrollmentDraft, FamilyMember } from "./enrollment-flow"

export type MemberFieldName = "displayName" | "identityNumber" | "phone"
export type ContactFieldName = "contactName" | "contactPhone" | "emergencyContactName" | "emergencyContactPhone"
export type EnrollmentInvalidTarget = { readonly reason: string; readonly anchor: string }


export function readFirstEnrollmentInvalidTarget(draft: EnrollmentDraft): EnrollmentInvalidTarget | undefined {
  const selectedMembers = draft.familyMembers.filter((member) => member.selected)
  const addsStudent = selectedMembers.some((member) => member.remoteMemberId === undefined && (member.participantKind ?? "student") === "student")
  const addsOnlyAdultMembers = selectedMembers.length > 0 && selectedMembers.every((member) => member.remoteMemberId === undefined && member.participantKind === "adult")
  if (draft.selectedSchoolId.length === 0 && !addsOnlyAdultMembers) return { reason: "请选择学校、年级和班级", anchor: "enrollment-school-field" }
  if (addsStudent && draft.selectedGradeId.length === 0) return { reason: "请选择年级", anchor: "enrollment-grade-field" }
  if (addsStudent && draft.selectedClassId.length === 0) return { reason: "请选择班级", anchor: "enrollment-class-field" }
  if (draft.selectedTourSessionId.length === 0) return { reason: "请选择可报名团期", anchor: "enrollment-session-field" }
  if (selectedMembers.length === 0) return { reason: "请至少添加或选择一名参与成员", anchor: "enrollment-members-field" }

  for (const member of selectedMembers) {
    const displayNameError = readMemberFieldError(member, "displayName")
    if (displayNameError !== undefined) return { reason: displayNameError, anchor: memberFieldAnchor(member.id, "displayName") }
  }

  for (const member of selectedMembers.filter((member) => member.remoteMemberId === undefined)) {
    const identityError = readMemberFieldError(member, "identityNumber")
    if (identityError !== undefined) return { reason: identityError, anchor: memberFieldAnchor(member.id, "identityNumber") }
    const phoneError = readMemberFieldError(member, "phone")
    if (phoneError !== undefined) return { reason: phoneError, anchor: memberFieldAnchor(member.id, "phone") }
  }

  const contactTargets = [
    ["contactName", "enrollment-contact-name-field"],
    ["contactPhone", "enrollment-contact-phone-field"],
    ["emergencyContactName", "enrollment-emergency-name-field"],
    ["emergencyContactPhone", "enrollment-emergency-phone-field"],
  ] as const
  for (const [field, anchor] of contactTargets) {
    const error = readContactFieldError(draft, field)
    if (error !== undefined) return { reason: error, anchor }
  }

  if (!draft.agreementAccepted) return { reason: "请确认报名须知", anchor: "enrollment-agreement-field" }
  return undefined
}

export function memberFieldAnchor(memberId: string, field: MemberFieldName): string {
  return `enrollment-member-${memberId.replace(/[^A-Za-z0-9_-]/g, "-")}-${field}`
}

export function readMemberFieldError(member: FamilyMember, field: MemberFieldName): string | undefined {
  if (!member.selected) return undefined
  if (field === "displayName") {
    return member.displayName.trim().length === 0 ? "请填写参加人姓名" : undefined
  }
  if (member.remoteMemberId !== undefined) return undefined
  if (field === "identityNumber") {
    const value = (member.identityNumber ?? "").trim()
    if (value.length === 0) return "请填写参加人的证件号码"
    return isResidentIdentityNumber(value) ? undefined : "请填写有效的证件号码"
  }
  if ((member.participantKind ?? "student") === "student") return undefined
  const phone = (member.phone ?? "").trim()
  if (phone.length === 0) return undefined
  return isMobilePhone(phone) ? undefined : "请填写有效的联系电话"
}

export function readContactFieldError(draft: EnrollmentDraft, field: ContactFieldName): string | undefined {
  if (field === "contactName") {
    return draft.contactName.trim().length === 0 ? "请填写家长联系人姓名" : undefined
  }
  if (field === "contactPhone") {
    const phone = draft.contactPhone.trim()
    return isMobilePhone(phone) ? undefined : "请填写有效的家长联系电话"
  }
  if (draft.emergencySameAsParent) return undefined
  if (field === "emergencyContactName") {
    return draft.emergencyContact.name.trim().length === 0 ? "请填写紧急联系人姓名" : undefined
  }
  const phone = draft.emergencyContact.phone.trim()
  if (phone.length === 0) return "请填写紧急联系人电话"
  return isMobilePhone(phone) ? undefined : "请填写正确的紧急联系人电话"
}

export function createLocalMemberCode(seed: string = `${Date.now()}-${Math.random()}`): string {
  const normalized = seed.replace(/[^a-zA-Z0-9]/g, "").slice(-18)
  return `lm-${normalized.padStart(8, "0")}`
}

function isMobilePhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(value)
}

function isResidentIdentityNumber(value: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(value)) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const
  const checkCodes = "10X98765432"
  let sum = 0
  for (const [index, weight] of weights.entries()) {
    sum += Number(value[index] ?? "0") * weight
  }
  return value[17]?.toUpperCase() === checkCodes[sum % 11]
}
