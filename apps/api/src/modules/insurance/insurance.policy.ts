import { ConflictException, ForbiddenException } from "@nestjs/common"
import type { InternalTravelerSnapshot, TravelerRecord } from "../travelers/travelers.types.js"
import type { InsuranceAccess, InsuranceBatchPerson, InsuranceBatchSnapshot, InsuranceRosterDiff } from "./insurance.types.js"

export type InsuranceDraftInput = {
  readonly id: string
  readonly actorId: string
  readonly snapshot: InternalTravelerSnapshot
  readonly companyTemplateName: string | null
}

export function buildInsuranceDraft(input: InsuranceDraftInput): InsuranceBatchSnapshot {
  const people = input.snapshot.travelers.filter(insuranceCandidate).map((traveler, index) => toPerson(input.id, index, traveler))
  const blocked = people.some((person) => person.issueCode !== null)
  return {
    id: input.id,
    tourSessionId: input.snapshot.tourSessionId,
    organizationId: input.snapshot.organizationId,
    rosterVersion: input.snapshot.rosterVersion,
    status: blocked ? "blocked" : "draft",
    companyTemplateName: input.companyTemplateName,
    submittedAt: null,
    createdAt: new Date(0).toISOString(),
    people,
    handoffs: [],
  }
}

export function assertBatchSubmittable(batch: InsuranceBatchSnapshot, expectedRosterVersion: string): void {
  if (batch.rosterVersion !== expectedRosterVersion) {
    throw new ConflictException({ code: "insurance_roster_version_stale", message: "名单版本已变化，请重新生成保险批次" })
  }
  if (batch.status !== "draft") {
    throw new ConflictException({ code: "insurance_batch_not_submittable", message: "保险批次存在缺证、冲突或已送交，不能覆盖送交" })
  }
  if (batch.people.some((person) => person.issueCode !== null)) {
    throw new ConflictException({ code: "insurance_batch_blocked", message: "保险批次存在缺证或名单冲突" })
  }
}

export function assertSensitiveExportAllowed(access: Pick<InsuranceAccess, "permissionKeys">): void {
  if (!access.permissionKeys.has("insurance.sensitive.export")) {
    throw new ForbiddenException({ code: "insurance_sensitive_export_forbidden", message: "缺少完整证件导出权限" })
  }
}

export function diffInsuranceBatch(batch: InsuranceBatchSnapshot, snapshot: InternalTravelerSnapshot): InsuranceRosterDiff {
  const current = new Map(snapshot.travelers.filter(insuranceCandidate).map((traveler) => [traveler.personRef, traveler]))
  const previous = new Map(batch.people.map((person) => [person.personRef, person]))
  const addedRefs = [...current.keys()].filter((ref) => !previous.has(ref)).sort()
  const removedRefs = [...previous.keys()].filter((ref) => !current.has(ref)).sort()
  const changedRefs = [...current.entries()]
    .filter(([ref, traveler]) => {
      const person = previous.get(ref)
      return person !== undefined && personSignature(person) !== travelerSignature(traveler)
    })
    .map(([ref]) => ref)
    .sort()
  return {
    rosterChanged: batch.rosterVersion !== snapshot.rosterVersion || addedRefs.length > 0 || removedRefs.length > 0 || changedRefs.length > 0,
    currentRosterVersion: snapshot.rosterVersion,
    addedRefs,
    removedRefs,
    changedRefs,
  }
}

export function assertInsurancePermission(access: Pick<InsuranceAccess, "permissionKeys">, permission: string): void {
  if (!access.permissionKeys.has(permission)) {
    throw new ForbiddenException({ code: "insurance_permission_forbidden", message: "缺少保险操作权限" })
  }
}

function insuranceCandidate(traveler: TravelerRecord): boolean {
  return traveler.active || traveler.conflict !== null
}

function toPerson(batchId: string, index: number, traveler: TravelerRecord): InsuranceBatchPerson {
  const issueCode = traveler.conflict !== null ? "traveler_conflict" : traveler.identityCiphertext === null ? "missing_identity" : null
  return {
    id: `${batchId}-person-${index + 1}`,
    personRef: traveler.personRef,
    sourceRefs: traveler.sourceRefs,
    displayName: traveler.displayName,
    className: traveler.className,
    identityMasked: traveler.identityMasked,
    identityCiphertext: traveler.identityCiphertext,
    phoneMasked: traveler.phoneMasked,
    phoneCiphertext: traveler.phoneCiphertext,
    personDataKeyVersion: traveler.personDataKeyVersion,
    status: issueCode === null ? "ready" : "blocked",
    issueCode,
    policyNumber: null,
    receiptReference: null,
    coverageStart: null,
    coverageEnd: null,
  }
}

function personSignature(person: Pick<InsuranceBatchPerson, "displayName" | "identityMasked" | "phoneMasked" | "issueCode">): string {
  return JSON.stringify([person.displayName, person.identityMasked, person.phoneMasked, person.issueCode])
}

function travelerSignature(traveler: TravelerRecord): string {
  return JSON.stringify([
    traveler.displayName,
    traveler.identityMasked,
    traveler.phoneMasked,
    traveler.conflict !== null ? "traveler_conflict" : traveler.identityCiphertext === null ? "missing_identity" : null,
  ])
}
