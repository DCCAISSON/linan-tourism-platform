import { DOMAIN_SCHEMA_VERSION } from "@linan/contracts"
import {
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
  type EnrollmentMemberPayload,
  type EnrollmentPayload,
  type Grade,
  type School,
  type SchoolClass,
  type TourSession,
} from "./api"

export type FamilyMember = {
  id: string
  code: string
  displayName: string
  participantKind?: "student" | "adult"
  identityNumber?: string
  phone?: string
  selected: boolean
  remoteMemberId?: string
}

export type EmergencyContact = {
  readonly name: string
  readonly phone: string
}

export type EnrollmentDraft = {
  readonly contactName: string
  readonly emergencyContact: EmergencyContact
  readonly selectedSchoolId: string
  readonly selectedGradeId: string
  readonly selectedClassId: string
  readonly selectedTourSessionId: string
  readonly agreementAccepted: boolean
  readonly familyMembers: readonly FamilyMember[]
}

export type CatalogState = {
  readonly schools: readonly School[]
  readonly grades: readonly Grade[]
  readonly classes: readonly SchoolClass[]
  readonly sessions: readonly TourSession[]
}

export type PageMode = "editing" | "review" | "submitting" | "paymentPending" | "paid"
export type LoadState = "loading" | "ready" | "empty" | "error"

export type EnrollmentReadiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly reason: string }

export function createEmptyDraft(): EnrollmentDraft {
  return {
    contactName: "",
    emergencyContact: {
      name: "",
      phone: "",
    },
    selectedSchoolId: "",
    selectedGradeId: "",
    selectedClassId: "",
    selectedTourSessionId: "",
    agreementAccepted: false,
    familyMembers: [],
  }
}

export function selectedFamilyMembers(
  members: readonly FamilyMember[],
): readonly FamilyMember[] {
  return members.filter((member) => member.selected && member.displayName.trim().length > 0)
}

export function readEnrollmentReadiness(draft: EnrollmentDraft): EnrollmentReadiness {
  const selectedMembers = selectedFamilyMembers(draft.familyMembers)
  const addsStudent = selectedMembers.some((member) => member.remoteMemberId === undefined && (member.participantKind ?? "student") === "student")
  const addsOnlyAdultMembers = selectedMembers.length > 0 && selectedMembers.every((member) => member.remoteMemberId === undefined && member.participantKind === "adult")
  if (
    (draft.selectedSchoolId.length === 0 && !addsOnlyAdultMembers)
    || (addsStudent && (draft.selectedGradeId.length === 0 || draft.selectedClassId.length === 0))
  ) {
    return { ready: false, reason: "请选择学校、年级和班级" }
  }

  if (draft.selectedTourSessionId.length === 0) {
    return { ready: false, reason: "请选择可报名团期" }
  }

  if (selectedMembers.length === 0) {
    return { ready: false, reason: "请至少选择一名家庭成员" }
  }

  if (selectedMembers.some((member) => member.code.trim().length === 0 || member.displayName.trim().length === 0)) {
    return { ready: false, reason: "请填写成员编号" }
  }

  if (selectedMembers.some((member) => member.remoteMemberId === undefined && ((member.identityNumber ?? "").trim().length === 0 || (member.phone ?? "").trim().length === 0))) {
    return { ready: false, reason: "请填写证件号码和联系电话" }
  }

  if (draft.contactName.trim().length === 0) {
    return { ready: false, reason: "请填写家长联系人" }
  }

  if (draft.emergencyContact.name.trim().length === 0 || draft.emergencyContact.phone.trim().length === 0) {
    return { ready: false, reason: "请填写紧急联系人" }
  }

  if (!draft.agreementAccepted) {
    return { ready: false, reason: "请确认协议版本" }
  }

  return { ready: true }
}

export function buildEnrollmentPayload(
  draft: EnrollmentDraft,
  catalog: CatalogState,
  memberIds: readonly string[],
): EnrollmentPayload {
  const readiness = readEnrollmentReadiness(draft)
  if (!readiness.ready) {
    throw new Error(readiness.reason)
  }

  const selectedSession = catalog.sessions.find((session) => session.id === draft.selectedTourSessionId)
  if (selectedSession === undefined) {
    throw new Error("请选择有效团期")
  }

  return {
    tourSessionId: selectedSession.id,
    memberIds,
    contactName: draft.contactName.trim(),
    emergencyContactName: draft.emergencyContact.name.trim(),
    emergencyContactPhone: draft.emergencyContact.phone.trim(),
    agreementVersion: FAMILY_ENROLLMENT_AGREEMENT_VERSION,
    schemaVersion: DOMAIN_SCHEMA_VERSION,
  }
}

export function buildSelectedMemberPayloads(draft: EnrollmentDraft): readonly EnrollmentMemberPayload[] {
  const readiness = readEnrollmentReadiness(draft)
  if (!readiness.ready) {
    throw new Error(readiness.reason)
  }

  return selectedFamilyMembers(draft.familyMembers).map((member) => buildMemberPayload(draft, member))
}

export async function prepareSelectedMembersForSubmit(
  draft: EnrollmentDraft,
  createMember: (payload: EnrollmentMemberPayload) => Promise<{ readonly id: string }>,
): Promise<readonly string[]> {
  const readiness = readEnrollmentReadiness(draft)
  if (!readiness.ready) {
    throw new Error(readiness.reason)
  }

  const memberIds: string[] = []
  const selectedMembers = selectedFamilyMembers(draft.familyMembers)

  for (const member of selectedMembers) {
    if (member.remoteMemberId !== undefined) {
      memberIds.push(member.remoteMemberId)
      continue
    }

    const created = await createMember(buildMemberPayload(draft, member))
    member.remoteMemberId = created.id
    memberIds.push(created.id)
  }

  return memberIds
}

function buildMemberPayload(draft: EnrollmentDraft, member: FamilyMember): EnrollmentMemberPayload {
  const participantKind = member.participantKind ?? "student"
  const base = {
    tourSessionId: draft.selectedTourSessionId,
    code: member.code.trim(),
    displayName: member.displayName.trim(),
    participantKind,
    identityNumber: (member.identityNumber ?? "").trim(),
    phone: (member.phone ?? "").trim(),
  } as const
  if (participantKind === "adult") {
    return base
  }
  return {
    ...base,
    schoolId: draft.selectedSchoolId,
    gradeId: draft.selectedGradeId,
    classId: draft.selectedClassId,
  }
}

export function isCatalogEmpty(catalog: CatalogState): boolean {
  return catalog.schools.length === 0 || catalog.sessions.length === 0
}

export function optionNames<T extends { readonly name?: string; readonly code: string }>(
  options: readonly T[],
): readonly string[] {
  return options.map((option) => option.name ?? option.code)
}

export function sessionOptionNames(sessions: readonly TourSession[]): readonly string[] {
  return sessions.map((session) => `${session.code} · ${formatFen(session.priceFen)} · ${sessionStatusLabel(session.status)}`)
}

export function formatFen(priceFen: number): string {
  return `¥${(priceFen / 100).toFixed(2)}`
}

export function formatDateLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

function sessionStatusLabel(status: TourSession["status"]): string {
  switch (status) {
    case "published":
      return "可报名"
    case "draft":
      return "未开放"
    case "closed":
      return "已关闭"
    case "cancelled":
      return "已取消"
    default:
      return assertNever(status)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected enrollment state: ${value}`)
}
