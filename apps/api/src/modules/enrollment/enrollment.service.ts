import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { DOMAIN_POLICY_VERSION, ENROLLMENT_STATUS } from "@linan/contracts"
import { In } from "typeorm"
import type { EntityManager } from "typeorm"
import {
  ConsentRecordEntity,
  EnrollmentEntity,
  EnrollmentParticipantEntity,
  FamilyEntity,
  FamilyMemberEntity,
  NoticeVersionEntity,
  SchoolClassEntity,
  SchoolGradeEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { throwWriteConflict } from "../configuration/configuration.errors.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { ConfigurationService } from "../configuration/configuration.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import {
  applyMemberPatch,
  ensureFamily,
  ensureSchoolPlacement,
  findFamilyByCode,
  findScopedMember,
  memberFromInput,
  resolveMemberOrganization,
} from "./enrollment.persistence.js"
import type {
  EnrollmentIdentity,
  EnrollmentSubmissionResponse,
  FamilyMemberResponse,
  NewEnrollmentSubmission,
  NewFamilyMember,
  UpdateFamilyMember,
} from "./enrollment.types.js"
import { protectPersonData } from "./person-data.js"

const CONSENT_PURPOSE = "enrollment_submission"

@Injectable()
export class EnrollmentService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(ConfigurationService) private readonly configuration: ConfigurationService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async createMember(identity: EnrollmentIdentity, input: NewFamilyMember): Promise<FamilyMemberResponse> {
    const dataSource = await this.database.getDataSource()
    try {
      const member = await dataSource.transaction(async (manager) => {
        const resolved = await resolveMemberOrganization(manager, input)
        const family = await ensureFamily(manager, identity.familyCode, resolved.organizationId)
        const protectedInput = {
          ...resolved,
          protectedPersonData: input.personData === undefined ? undefined : protectPersonData(input.personData),
        }
        return manager.save(FamilyMemberEntity, memberFromInput(protectedInput, family))
      })
      return toMemberResponse(member)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async listMembers(identity: EnrollmentIdentity): Promise<readonly FamilyMemberResponse[]> {
    const dataSource = await this.database.getDataSource()
    const families = await dataSource.getRepository(FamilyEntity).findBy({ code: identity.familyCode })
    if (families.length === 0) {
      return []
    }
    const members = await dataSource
      .getRepository(FamilyMemberEntity)
      .find({ where: { familyId: In(families.map((family) => family.id)) }, order: { code: "ASC" } })
    return members.map(toMemberResponse)
  }

  async getMember(identity: EnrollmentIdentity, memberId: string): Promise<FamilyMemberResponse> {
    const member = await findScopedMember(await this.manager(), identity.familyCode, memberId)
    if (member === null) {
      throw memberNotFound()
    }
    return toMemberResponse(member)
  }

  async updateMember(
    identity: EnrollmentIdentity,
    memberId: string,
    input: UpdateFamilyMember,
  ): Promise<FamilyMemberResponse> {
    const dataSource = await this.database.getDataSource()
    try {
      const member = await dataSource.transaction(async (manager) => {
        const existing = await findScopedMember(manager, identity.familyCode, memberId)
        if (existing === null) {
          throw memberNotFound()
        }
        const gradeId = input.gradeId ?? existing.gradeId
        const classId = input.classId ?? existing.classId
        if (gradeId !== null && classId !== null) {
          await ensureSchoolPlacement(manager, { schoolId: existing.organizationId, gradeId, classId })
        }
        applyMemberPatch(existing, input)
        return manager.save(FamilyMemberEntity, existing)
      })
      return toMemberResponse(member)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async deleteMember(identity: EnrollmentIdentity, memberId: string): Promise<void> {
    const dataSource = await this.database.getDataSource()
    const member = await findScopedMember(dataSource.manager, identity.familyCode, memberId)
    if (member === null) {
      throw memberNotFound()
    }
    try {
      await dataSource.getRepository(FamilyMemberEntity).delete(member.id)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async submitEnrollment(
    identity: EnrollmentIdentity,
    input: NewEnrollmentSubmission,
  ): Promise<EnrollmentSubmissionResponse> {
    await this.configuration.checkEnrollmentAvailability(input.tourSessionId, new Date())
    const dataSource = await this.database.getDataSource()
    try {
      return await dataSource.transaction(async (manager) => {
        const session = await manager.findOneBy(TourSessionEntity, { id: input.tourSessionId })
        if (session === null) {
          throw new NotFoundException({ code: "not_found", message: "tour session was not found" })
        }
        const notice = await this.requireActiveNotice(manager, session, input)
        const family = await findFamilyByCode(manager, identity.familyCode, session.organizationId)
        if (family === null) {
          throw memberNotFound()
        }
        const members = await manager.findBy(FamilyMemberEntity, { id: In([...input.memberIds]), familyId: family.id })
        if (members.length !== input.memberIds.length) {
          throw memberNotFound()
        }
        const enrollment = await manager.save(EnrollmentEntity, {
          id: makeId("enrollment"),
          organizationId: session.organizationId,
          tourSessionId: session.id,
          familyId: family.id,
          code: makeId("enrollment"),
          contactName: input.contactName,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          participantCount: members.length,
          status: ENROLLMENT_STATUS.pending,
          policyVersion: DOMAIN_POLICY_VERSION,
        })
        await this.createParticipants(manager, { enrollmentId: enrollment.id, familyId: family.id, members })
        await manager.save(ConsentRecordEntity, {
          id: makeId("consent"),
          organizationId: session.organizationId,
          familyId: family.id,
          subjectId: enrollment.id,
          purpose: CONSENT_PURPOSE,
          granted: true,
          agreementVersion: input.agreementVersion,
          schemaVersion: input.schemaVersion,
          noticeVersionId: notice.id,
          noticeVersion: notice.version,
          acceptedAt: new Date(),
          policyVersion: DOMAIN_POLICY_VERSION,
        })
        await this.audit.record(manager, {
          organizationId: session.organizationId,
          actorId: family.id,
          action: "agreement.confirmed",
          targetType: "enrollment",
          targetId: enrollment.id,
        })
        return {
          id: enrollment.id,
          code: enrollment.code,
          tourSessionId: enrollment.tourSessionId,
          familyId: family.id,
          memberIds: input.memberIds,
          participantCount: enrollment.participantCount,
          status: enrollment.status,
          policyVersion: enrollment.policyVersion,
          agreementVersion: input.agreementVersion,
          schemaVersion: input.schemaVersion,
          noticeVersionId: notice.id,
          noticeVersion: notice.version,
        }
      })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  private async requireActiveNotice(
    manager: EntityManager,
    session: TourSessionEntity,
    input: NewEnrollmentSubmission,
  ): Promise<NoticeVersionEntity> {
    if (session.activeNoticeId === null) {
      throw new BadRequestException({ code: "stale_state", message: "tour session has no active parent notice" })
    }
    const notice = await manager.findOneBy(NoticeVersionEntity, { id: session.activeNoticeId })
    if (notice === null || notice.tourSessionId !== session.id || notice.organizationId !== session.organizationId) {
      throw new BadRequestException({ code: "stale_state", message: "active parent notice was not found" })
    }
    if (input.noticeVersionId !== notice.id || input.noticeVersion !== notice.version) {
      throw new BadRequestException({ code: "stale_state", message: "parent notice version is no longer active" })
    }
    return notice
  }

  private async createParticipants(
    manager: EntityManager,
    input: {
      readonly enrollmentId: string
      readonly familyId: string
      readonly members: readonly FamilyMemberEntity[]
    },
  ): Promise<void> {
    for (const member of input.members) {
      const grade = member.gradeId === null ? null : await manager.findOneBy(SchoolGradeEntity, { id: member.gradeId })
      const schoolClass = member.classId === null ? null : await manager.findOneBy(SchoolClassEntity, { id: member.classId })
        await manager.save(EnrollmentParticipantEntity, {
        id: makeId("participant"),
        organizationId: member.organizationId,
        enrollmentId: input.enrollmentId,
        familyId: input.familyId,
        familyMemberId: member.id,
        displayNameSnapshot: member.displayName,
        participantKindSnapshot: member.participantKind,
        gradeNameSnapshot: grade?.name ?? null,
        classNameSnapshot: schoolClass?.name ?? null,
        identityCiphertextSnapshot: member.identityCiphertext,
        identityHashSnapshot: member.identityHash,
        identityMaskedSnapshot: member.identityMasked,
        phoneCiphertextSnapshot: member.phoneCiphertext,
        phoneHashSnapshot: member.phoneHash,
        phoneMaskedSnapshot: member.phoneMasked,
        personDataKeyVersionSnapshot: member.personDataKeyVersion,
        policyVersion: DOMAIN_POLICY_VERSION,
      })
    }
  }

  private async manager(): Promise<EntityManager> {
    return (await this.database.getDataSource()).manager
  }
}

function toMemberResponse(member: FamilyMemberEntity): FamilyMemberResponse {
  return {
    id: member.id,
    code: member.code,
    displayName: member.displayName,
    participantKind: member.participantKind,
    schoolId: member.organizationId,
    gradeId: member.gradeId,
    classId: member.classId,
    identityNumberMasked: member.identityMasked,
    phoneMasked: member.phoneMasked,
  }
}

function memberNotFound(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "family member was not found" })
}
