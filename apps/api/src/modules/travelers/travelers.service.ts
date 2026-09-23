import { randomUUID } from "node:crypto"
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import {
  OrganizationEntity,
  RosterImportPersonEntity,
  SchoolClassEntity,
  SchoolGradeEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { TravelerImportChangeEntity } from "../../domain/entities/traveler-import-change.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { protectPersonData } from "../enrollment/person-data.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import type { ImportChangeInput, ImportCorrection, TravelerQuery } from "./travelers.parser.js"
import { readScopedTravelers, resolveTraveler, toTravelerDto } from "./travelers.read-model.js"
import type { InternalTravelerSnapshot, PersonRef, TravelerDto, TravelerSnapshot } from "./travelers.types.js"

export type TravelerListResponse = TravelerSnapshot & {
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

@Injectable()
export class TravelersService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async list(access: StaffAccess, tourSessionId: string, query: TravelerQuery): Promise<TravelerListResponse> {
    const manager = (await this.database.getDataSource()).manager
    const snapshot = await this.readAllowedSnapshot(manager, access, tourSessionId, query.classId, "read")
    return pageSnapshot(snapshot, filterTravelers(snapshot.travelers.map(toTravelerDto), query), query)
  }

  async detail(access: StaffAccess, tourSessionId: string, personRef: PersonRef): Promise<TravelerDto> {
    const manager = (await this.database.getDataSource()).manager
    const snapshot = await this.readAllowedSnapshot(manager, access, tourSessionId, null, "read")
    return toTravelerDto(resolveTraveler(snapshot, personRef))
  }

  async exportRows(access: StaffAccess, tourSessionId: string, query: TravelerQuery): Promise<readonly TravelerDto[]> {
    const manager = (await this.database.getDataSource()).manager
    const snapshot = await this.readAllowedSnapshot(manager, access, tourSessionId, query.classId, "export")
    return filterTravelers(snapshot.travelers.map(toTravelerDto), { ...query, page: 1, pageSize: 200000 })
  }

  async confirmImport(access: StaffAccess, importPersonId: string, input: ImportChangeInput): Promise<TravelerListResponse> {
    return this.changeImport(access, importPersonId, input, "confirm", async (manager, person) => {
      person.status = "active"
      person.eligibilityStatus = "confirmed"
      person.eligibilityReason = input.reason
      person.version += 1
      await manager.save(person)
    })
  }

  async disableImport(access: StaffAccess, importPersonId: string, input: ImportChangeInput): Promise<TravelerListResponse> {
    return this.changeImport(access, importPersonId, input, "disable", async (manager, person) => {
      person.status = "disabled"
      person.eligibilityReason = input.reason
      person.version += 1
      await manager.save(person)
    })
  }

  async correctImport(access: StaffAccess, importPersonId: string, input: ImportCorrection): Promise<TravelerListResponse> {
    return this.changeImport(access, importPersonId, input, "correct", async (manager, person) => {
      await assertCorrectionScope(manager, person.organizationId, input)
      person.displayName = input.displayName
      person.role = input.role
      person.gradeId = input.gradeId
      person.classId = input.classId
      person.status = "active"
      person.eligibilityStatus = "confirmed"
      person.eligibilityReason = input.reason
      if (input.identityNumber !== undefined && input.phone !== undefined) {
        const protectedData = protectPersonData({ identityNumber: input.identityNumber, phone: input.phone })
        person.identityCiphertext = protectedData.identityCiphertext
        person.identityHash = protectedData.identityHash
        person.identityMasked = protectedData.identityMasked
        person.phoneCiphertext = protectedData.phoneCiphertext
        person.phoneHash = protectedData.phoneHash
        person.phoneMasked = protectedData.phoneMasked
        person.personDataKeyVersion = protectedData.keyVersion
      }
      person.version += 1
      await manager.save(person)
    })
  }

  private async changeImport(
    access: StaffAccess,
    importPersonId: string,
    input: ImportChangeInput,
    action: "confirm" | "disable" | "correct",
    apply: (manager: EntityManager, person: RosterImportPersonEntity) => Promise<void>,
  ): Promise<TravelerListResponse> {
    assertRosterCorrect(access)
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const person = await manager.findOne(RosterImportPersonEntity, { where: { id: importPersonId }, lock: { mode: "pessimistic_write" } })
      if (person === null) throw new NotFoundException({ code: "traveler_import_not_found", message: "导入人员不存在" })
      const beforeSnapshot = await this.readAllowedSnapshot(manager, access, person.tourSessionId, person.classId, "read")
      if (beforeSnapshot.rosterVersion !== input.expectedRosterVersion) {
        throw new ConflictException({ code: "stale_roster_version", message: "名单版本已变化，请刷新后重试" })
      }
      if (person.version !== input.expectedVersion) {
        throw new ConflictException({ code: "stale_import_version", message: "导入记录版本已变化，请刷新后重试" })
      }
      const before = importAuditValues(person)
      await apply(manager, person)
      await manager.save(manager.create(TravelerImportChangeEntity, {
        id: `tic-${randomUUID()}`,
        importPersonId: person.id,
        actorId: access.actorId,
        action,
        reason: input.reason,
        beforeValues: before,
        afterValues: importAuditValues(person),
      }))
      await this.audit.record(manager, {
        organizationId: person.organizationId,
        actorId: access.actorId,
        action: `traveler.import.${action}`,
        targetType: "roster_import_person",
        targetId: person.id,
      })
      const nextSnapshot = await this.readAllowedSnapshot(manager, access, person.tourSessionId, person.classId, "read")
      return pageSnapshot(nextSnapshot, filterTravelers(nextSnapshot.travelers.map(toTravelerDto), defaultQuery(person.classId)), defaultQuery(person.classId))
    })
  }

  private async readAllowedSnapshot(
    manager: EntityManager,
    access: StaffAccess,
    tourSessionId: string,
    classId: string | null,
    mode: "read" | "export",
  ): Promise<InternalTravelerSnapshot> {
    const session = await manager.findOneBy(TourSessionEntity, { id: tourSessionId })
    if (session === null) throw new NotFoundException({ code: "tour_session_not_found", message: "团期不存在" })
    const scope = { schoolId: session.organizationId, requestedSchoolId: session.organizationId, requestedClassId: classId, tourSessionId: session.id }
    if (mode === "export") this.staffAccess.assertRosterExportScope(access, scope)
    else this.staffAccess.assertRosterSummaryScope(access, scope)
    return readScopedTravelers(manager, { tourSessionId, classId })
  }
}

function pageSnapshot(snapshot: InternalTravelerSnapshot, rows: readonly TravelerDto[], query: TravelerQuery): TravelerListResponse {
  const start = (query.page - 1) * query.pageSize
  return {
    tourSessionId: snapshot.tourSessionId,
    organizationId: snapshot.organizationId,
    rosterVersion: snapshot.rosterVersion,
    activeCount: snapshot.activeCount,
    inactiveCount: snapshot.inactiveCount,
    conflictCount: snapshot.conflictCount,
    travelers: rows.slice(start, start + query.pageSize),
    total: rows.length,
    page: query.page,
    pageSize: query.pageSize,
  }
}

function filterTravelers(rows: readonly TravelerDto[], query: TravelerQuery): readonly TravelerDto[] {
  return rows.filter((row) => {
    if (!query.includeInactive && !row.active && row.conflict === null) return false
    if (query.source !== null && row.source !== query.source) return false
    if (query.search.length > 0 && !row.displayName.includes(query.search) && !row.sourceRefs.some((ref) => ref.includes(query.search))) return false
    return true
  })
}

function defaultQuery(classId: string | null): TravelerQuery {
  return { classId, includeInactive: true, source: null, search: "", page: 1, pageSize: 50 }
}

function assertRosterCorrect(access: StaffAccess): void {
  const permissions: ReadonlySet<string> = access.permissionKeys
  if (permissions.has("roster.correct")) return
  throw new ForbiddenException({ code: "staff_scope_forbidden", message: "staff identity cannot correct travelers" })
}

async function assertCorrectionScope(manager: EntityManager, organizationId: string, input: ImportCorrection): Promise<void> {
  const organization = await manager.findOneBy(OrganizationEntity, { id: organizationId })
  if (organization === null) throw new NotFoundException({ code: "organization_not_found", message: "学校不存在" })
  if (input.gradeId !== null) {
    const grade = await manager.findOneBy(SchoolGradeEntity, { id: input.gradeId })
    if (grade === null || grade.organizationId !== organizationId) throw new ConflictException({ code: "grade_scope_mismatch", message: "年级不属于该学校" })
  }
  if (input.classId !== null) {
    const schoolClass = await manager.findOneBy(SchoolClassEntity, { id: input.classId })
    if (schoolClass === null || schoolClass.gradeId !== input.gradeId) throw new ConflictException({ code: "class_scope_mismatch", message: "班级不属于该年级" })
  }
}

function importAuditValues(person: RosterImportPersonEntity): Record<string, string | number | null> {
  return {
    displayName: person.displayName,
    role: person.role,
    gradeId: person.gradeId,
    classId: person.classId,
    status: person.status,
    eligibilityStatus: person.eligibilityStatus,
    eligibilityReason: person.eligibilityReason,
    identityMasked: person.identityMasked,
    phoneMasked: person.phoneMasked,
    version: person.version,
  }
}
