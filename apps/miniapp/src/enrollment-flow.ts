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
import { createLocalMemberCode, readFirstEnrollmentInvalidTarget } from "./enrollment-validation"

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
  return members.filter((member) => member.selected)
}

export function readEnrollmentReadiness(draft: EnrollmentDraft): EnrollmentReadiness {
  const target = readFirstEnrollmentInvalidTarget(draft)
  return target === undefined ? { ready: true } : { ready: false, reason: target.reason }
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

  const activeNotice = selectedSession.activeNotice
  if (activeNotice === null) {
    throw new Error("请先配置家长告知书")
  }

  return {
    tourSessionId: selectedSession.id,
    memberIds,
    contactName: draft.contactName.trim(),
    emergencyContactName: draft.emergencyContact.name.trim(),
    emergencyContactPhone: draft.emergencyContact.phone.trim(),
    agreementVersion: FAMILY_ENROLLMENT_AGREEMENT_VERSION,
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    noticeVersionId: activeNotice.id,
    noticeVersion: activeNotice.version,
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
    code: readInternalMemberCode(member),
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

function readInternalMemberCode(member: FamilyMember): string {
  const code = member.code.trim()
  return code.length > 0 ? code : createLocalMemberCode(member.id)
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
