import { BadRequestException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { SchoolClassEntity, SchoolGradeEntity, TourSessionEntity } from "../../domain/entities/index.js"

export type EnrollmentScope = readonly { readonly gradeId: string; readonly classIds: readonly string[] | null }[] | null

export function parseEnrollmentScope(value: unknown): EnrollmentScope {
  if (value === null) return null
  if (!Array.isArray(value) || value.length === 0) throw malformedScope()
  const grades = new Set<string>()
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("gradeId" in entry) || !("classIds" in entry)) throw malformedScope()
    const { gradeId, classIds } = entry
    if (typeof gradeId !== "string" || gradeId.trim().length === 0 || gradeId.length > 64 || grades.has(gradeId)) throw malformedScope()
    grades.add(gradeId)
    if (classIds === null) return { gradeId, classIds }
    if (!Array.isArray(classIds) || classIds.length === 0) throw malformedScope()
    const classes = new Set<string>()
    return { gradeId, classIds: classIds.map((id: unknown) => {
      if (typeof id !== "string" || id.trim().length === 0 || id.length > 64 || classes.has(id)) throw malformedScope()
      classes.add(id)
      return id
    }) }
  })
}

export async function ensureScopeHierarchy(manager: EntityManager, session: Pick<TourSessionEntity, "organizationId" | "enrollmentScopeJson">): Promise<void> {
  const scope = parseEnrollmentScope(session.enrollmentScopeJson)
  for (const entry of scope ?? []) {
    const grade = await manager.findOneBy(SchoolGradeEntity, { id: entry.gradeId })
    if (grade?.organizationId !== session.organizationId) throw hierarchyMismatch()
    for (const id of entry.classIds ?? []) {
      const schoolClass = await manager.findOneBy(SchoolClassEntity, { id })
      if (schoolClass?.gradeId !== grade.id) throw hierarchyMismatch()
    }
  }
}

type ScopeParticipant = {
  readonly organizationId: string
  readonly participantKind: string
  readonly gradeId: string | null
  readonly classId: string | null
}

export async function ensureParticipantsInScope(manager: EntityManager, session: TourSessionEntity, participants: readonly ScopeParticipant[]): Promise<void> {
  const scope = parseEnrollmentScope(session.enrollmentScopeJson)
  for (const participant of participants) {
    if (participant.organizationId !== session.organizationId) throw scopeMismatch()
    if (participant.participantKind === "adult" && participant.gradeId === null && participant.classId === null) continue
    if (participant.gradeId === null || participant.classId === null) throw scopeMismatch()
    const grade = await manager.findOneBy(SchoolGradeEntity, { id: participant.gradeId })
    const schoolClass = await manager.findOneBy(SchoolClassEntity, { id: participant.classId })
    if (grade?.organizationId !== session.organizationId || schoolClass?.gradeId !== participant.gradeId) throw scopeMismatch()
    if (scope !== null && !scope.some((entry) => entry.gradeId === participant.gradeId && (entry.classIds === null || entry.classIds.includes(participant.classId ?? "")))) throw scopeMismatch()
  }
}

export async function lockTourSession(manager: EntityManager, id: string): Promise<TourSessionEntity> {
  const session = await manager.findOne(TourSessionEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
  if (session === null) throw new BadRequestException({ code: "not_found", message: "tour session was not found" })
  return session
}

function malformedScope(): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message: "enrollmentScope must be null or distinct grades with null or non-empty distinct classIds" })
}

function hierarchyMismatch(): BadRequestException {
  return new BadRequestException({ code: "organization_mismatch", message: "enrollment scope must belong to the tour session school and grade" })
}

function scopeMismatch(): BadRequestException {
  return new BadRequestException({ code: "enrollment_scope_mismatch", message: "参加人不在当前活动的招生范围内，请重新选择年级和班级" })
}
