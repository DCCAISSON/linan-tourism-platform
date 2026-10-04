import { createHash } from "node:crypto"
import type { InternalTravelerSnapshot, TravelerConflict, TravelerRecord, TravelerSource } from "./travelers.types.js"

export function buildTravelerSnapshot(session: { readonly id: string; readonly organizationId: string }, inputs: readonly TravelerSource[]): InternalTravelerSnapshot {
  const groups = new Map<string, TravelerSource[]>()
  for (const source of [...inputs].sort((a, b) => a.personRef.localeCompare(b.personRef))) {
    const key = `${session.id}:${source.identityHash === null ? source.personRef : `${source.personDataKeyVersion}:${source.identityHash}`}`
    const group = groups.get(key) ?? []
    group.push(source)
    groups.set(key, group)
  }
  const travelers: TravelerRecord[] = []
  const sources: TravelerRecord[] = []
  for (const [dedupeKey, group] of groups) {
    const sourceRefs = group.map((source) => source.personRef)
    const conflictCode = detectConflict(group)
    const conflict: TravelerConflict | null = conflictCode === null ? null : { code: conflictCode, sourceRefs }
    const hasPaid = group.some((source) => source.source === "paid" && source.active)
    const records = group.map((source): TravelerRecord => {
      const paidAlias = source.source === "imported" && source.eligibility === "pending" && hasPaid
      return { ...source, dedupeKey, sourceRefs, conflict,
        active: paidAlias || source.active,
        eligibility: paidAlias ? "paid" : source.eligibility,
        inactiveReason: paidAlias ? null : source.inactiveReason }
    })
    sources.push(...records)
    const representative = [...records].sort((a, b) => priority(a) - priority(b) || a.personRef.localeCompare(b.personRef))[0]
    if (representative !== undefined) travelers.push(representative)
  }
  travelers.sort((a, b) => a.personRef.localeCompare(b.personRef))
  sources.sort((a, b) => a.personRef.localeCompare(b.personRef))
  const versionFields = sources.map((source) => ({
    personRef: source.personRef, sourceRefs: source.sourceRefs, dedupeKey: source.dedupeKey,
    active: source.active, inactiveReason: source.inactiveReason, conflict: source.conflict,
    displayName: source.displayName, gradeId: source.gradeId, classId: source.classId,
    gradeName: source.gradeName, className: source.className, participantKind: source.participantKind,
    importedRole: source.importedRole, eligibility: source.eligibility, importVersion: source.importVersion,
    familyId: source.familyId, familyMemberId: source.familyMemberId,
  }))
  return {
    tourSessionId: session.id, organizationId: session.organizationId,
    rosterVersion: createHash("sha256").update(JSON.stringify(versionFields)).digest("hex"), travelers, sources,
    activeCount: travelers.filter((source) => source.active && source.conflict === null).length,
    inactiveCount: travelers.filter((source) => !source.active && source.conflict === null).length,
    conflictCount: travelers.filter((source) => source.conflict !== null).length,
  }
}

function priority(source: TravelerRecord): number {
  if (source.active && source.source === "paid") return 0
  if (source.active) return 1
  return source.source === "imported" && source.eligibility !== "disabled" ? 2 : 3
}

function detectConflict(group: readonly TravelerSource[]): TravelerConflict["code"] | null {
  const enabledImports = group.filter((source) => source.source === "imported" && source.eligibility !== "disabled")
  const paid = group.filter((source) => source.source === "paid" && source.active)
  if (enabledImports.length > 0 && group.some((source) => source.source === "paid" && source.inactiveReason === "cancelled")) {
    return "eligibility_conflict"
  }
  if (paid.length > 1) return "duplicate_paid_sources"
  const relevant = [...paid, ...enabledImports]
  const fields = ["displayName", "classId", "participantKind", "phoneHash"] as const
  for (const field of fields) {
    if (new Set(relevant.map((source) => source[field]).filter((value) => value !== null)).size > 1) return "identity_fields_conflict"
  }
  return null
}
