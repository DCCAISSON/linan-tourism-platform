import { BadRequestException } from "@nestjs/common"
import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import type { EntityManager } from "typeorm"
import {
  FamilyEntity,
  FamilyMemberEntity,
  OrganizationEntity,
  SchoolClassEntity,
  SchoolGradeEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { NewFamilyMember, ProtectedFamilyMemberInput, UpdateFamilyMember } from "./enrollment.types.js"

export type SchoolPlacement = {
  readonly school: OrganizationEntity
  readonly grade: SchoolGradeEntity
  readonly schoolClass: SchoolClassEntity
}

export type SchoolPlacementIds = {
  readonly schoolId: string
  readonly gradeId: string
  readonly classId: string
}

export async function ensureSchoolPlacement(
  manager: EntityManager,
  ids: SchoolPlacementIds,
): Promise<SchoolPlacement> {
  const school = await manager.findOneBy(OrganizationEntity, { id: ids.schoolId })
  const grade = await manager.findOneBy(SchoolGradeEntity, { id: ids.gradeId })
  const schoolClass = await manager.findOneBy(SchoolClassEntity, { id: ids.classId })
  if (school === null || grade === null || schoolClass === null) {
    throw malformedSchoolPlacement()
  }
  if (grade.organizationId !== school.id || schoolClass.gradeId !== grade.id) {
    throw malformedSchoolPlacement()
  }
  return { school, grade, schoolClass }
}

export async function resolveMemberOrganization(
  manager: EntityManager,
  input: NewFamilyMember,
): Promise<ProtectedFamilyMemberInput> {
  if (input.participantKind === "student") {
    if (input.schoolId === undefined || input.gradeId === undefined || input.classId === undefined) {
      throw malformedSchoolPlacement()
    }
    await ensureSchoolPlacement(manager, {
      schoolId: input.schoolId,
      gradeId: input.gradeId,
      classId: input.classId,
    })
    return {
      ...input,
      organizationId: input.schoolId,
      gradeId: input.gradeId,
      classId: input.classId,
      protectedPersonData: undefined,
    }
  }
  if (input.schoolId !== undefined) {
    const school = await manager.findOneBy(OrganizationEntity, { id: input.schoolId })
    if (school === null) {
      throw malformedSchoolPlacement()
    }
    return { ...input, organizationId: school.id, gradeId: null, classId: null, protectedPersonData: undefined }
  }
  if (input.tourSessionId === undefined) {
    throw malformedSchoolPlacement()
  }
  const session = await manager.findOneBy(TourSessionEntity, { id: input.tourSessionId })
  if (session === null) {
    throw malformedSchoolPlacement()
  }
  return { ...input, organizationId: session.organizationId, gradeId: null, classId: null, protectedPersonData: undefined }
}

export async function findFamilyByCode(
  manager: EntityManager,
  familyCode: string,
  organizationId: string,
): Promise<FamilyEntity | null> {
  return manager.findOneBy(FamilyEntity, { code: familyCode, organizationId })
}

export async function ensureFamily(
  manager: EntityManager,
  familyCode: string,
  organizationId: string,
): Promise<FamilyEntity> {
  const existing = await findFamilyByCode(manager, familyCode, organizationId)
  if (existing !== null) {
    return existing
  }
  return manager.save(FamilyEntity, {
    id: makeId("family"),
    organizationId,
    code: familyCode,
    primaryContactName: "Parent",
    policyVersion: DOMAIN_POLICY_VERSION,
  })
}

export async function findScopedMember(
  manager: EntityManager,
  familyCode: string,
  memberId: string,
): Promise<FamilyMemberEntity | null> {
  const member = await manager.findOneBy(FamilyMemberEntity, { id: memberId })
  if (member === null) {
    return null
  }
  const family = await manager.findOneBy(FamilyEntity, { id: member.familyId })
  return family?.code === familyCode ? member : null
}

export function memberFromInput(input: ProtectedFamilyMemberInput, family: FamilyEntity): FamilyMemberEntity {
  return Object.assign(new FamilyMemberEntity(), {
    id: makeId("member"),
    organizationId: input.organizationId,
    familyId: family.id,
    code: input.code,
    displayName: input.displayName,
    participantKind: input.participantKind,
    gradeId: input.gradeId,
    classId: input.classId,
    identityCiphertext: input.protectedPersonData?.identityCiphertext ?? null,
    identityHash: input.protectedPersonData?.identityHash ?? null,
    identityMasked: input.protectedPersonData?.identityMasked ?? null,
    phoneCiphertext: input.protectedPersonData?.phoneCiphertext ?? null,
    phoneHash: input.protectedPersonData?.phoneHash ?? null,
    phoneMasked: input.protectedPersonData?.phoneMasked ?? null,
    personDataKeyVersion: input.protectedPersonData?.keyVersion ?? "v1",
    policyVersion: DOMAIN_POLICY_VERSION,
  })
}

export function applyMemberPatch(member: FamilyMemberEntity, input: UpdateFamilyMember): void {
  if (input.displayName !== undefined) {
    member.displayName = input.displayName
  }
  if (input.gradeId !== undefined) {
    member.gradeId = input.gradeId
  }
  if (input.classId !== undefined) {
    member.classId = input.classId
  }
}

function malformedSchoolPlacement(): BadRequestException {
  return new BadRequestException({
    code: "malformed_input",
    message: "school, grade, and class must belong to one hierarchy",
  })
}
