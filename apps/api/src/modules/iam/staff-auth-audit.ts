import type { EntityManager } from "typeorm"
import {
  OrganizationEntity,
  SchoolClassEntity,
  SchoolGradeEntity,
  StaffAccountEntity,
  StaffAccountScopeEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "./audit-log.service.js"
import type { StaffScope } from "./staff-permissions.js"

export async function recordStaffAccountAudit(
  database: ConfigurationDatabaseService,
  audit: AuditLogService,
  account: StaffAccountEntity,
  action: string,
  targetId: string,
): Promise<void> {
  const dataSource = await database.getDataSource()
  const rows = await dataSource.getRepository(StaffAccountScopeEntity).findBy({ staffAccountId: account.id })
  await recordStaffAuditForScopes(
    dataSource.manager,
    audit,
    account.id,
    rows.map((scope) => ({ kind: scope.scopeKind as StaffScope["kind"], id: scope.scopeId })),
    action,
    targetId,
  )
}

export async function recordStaffAuditForScopes(
  manager: EntityManager,
  audit: AuditLogService,
  actorId: string,
  scopes: readonly StaffScope[],
  action: string,
  targetId: string,
): Promise<void> {
  const organizationId = await resolveAuditOrganizationId(manager, scopes)
  if (organizationId === null) {
    return
  }
  await audit.record(manager, {
    organizationId,
    actorId,
    action,
    targetType: "staff_account",
    targetId,
  })
}

async function resolveAuditOrganizationId(manager: EntityManager, scopes: readonly StaffScope[]): Promise<string | null> {
  for (const scope of scopes) {
    if ((scope.kind === "organization" || scope.kind === "school") && scope.id !== null) {
      return scope.id
    }
    if (scope.kind === "tour_session" && scope.id !== null) {
      const session = await manager.findOneBy(TourSessionEntity, { id: scope.id })
      if (session !== null) {
        return session.organizationId
      }
    }
    if (scope.kind === "class" && scope.id !== null) {
      const schoolClass = await manager.findOneBy(SchoolClassEntity, { id: scope.id })
      if (schoolClass !== null) {
        const grade = await manager.findOneBy(SchoolGradeEntity, { id: schoolClass.gradeId })
        if (grade !== null) {
          return grade.organizationId
        }
      }
    }
  }
  const [organization] = await manager.find(OrganizationEntity, { order: { id: "ASC" }, take: 1 })
  return organization?.id ?? null
}
