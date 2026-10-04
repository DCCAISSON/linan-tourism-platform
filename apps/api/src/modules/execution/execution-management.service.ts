import { ForbiddenException, Inject, Injectable } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ExecutionAttendanceEntity } from "../../domain/entities/execution-attendance.entity.js"
import { ExecutionDailyReportEntity } from "../../domain/entities/execution-daily-report.entity.js"
import { ExecutionPersonDailyReportEntity } from "../../domain/entities/execution-person-daily-report.entity.js"
import { ExecutionEventEntity } from "../../domain/entities/execution-event.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { readTravelers } from "../travelers/travelers.read-model.js"
import { readTransportConfirmation } from "../transport/transport-confirmation.read.js"
import { ExecutionAccessService } from "./execution-access.service.js"
import { hasSessionScope } from "./execution-access.policy.js"
import { parsePersonRef } from "./execution.parser.js"
import { groupPeople, type ExecutionManagementDetail } from "./execution-management.types.js"

@Injectable()
export class ExecutionManagementService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(ExecutionAccessService) private readonly access: ExecutionAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async assertManager(access: StaffAccess): Promise<EntityManager> {
    if (!access.permissionKeys.has("execution.read") || !access.permissionKeys.has("execution.manage")) throw new ForbiddenException({ code: "execution_manage_forbidden", message: "无权管理执行记录" })
    const manager = (await this.database.getDataSource()).manager
    await this.access.requireActiveAccount(manager, access.actorId)
    return manager
  }

  async listSessions(access: StaffAccess) {
    const manager = await this.assertManager(access)
    const sessions = await manager.find(TourSessionEntity, { order: { startsAt: "DESC" } })
    return sessions.filter(session => hasSessionScope(access, session)).map(session => ({ id: session.id, code: session.code, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), vehicleIds: [] }))
  }

  async detail(access: StaffAccess, sessionId: string): Promise<ExecutionManagementDetail> {
    const manager = await this.assertManager(access)
    const session = await this.access.session(manager, access, sessionId)
    const confirmation = await readTransportConfirmation(manager, session.id)
    const vehicles = confirmation.status === "current" ? confirmation.snapshot.vehicles.map(vehicle => ({ id: vehicle.id, sequence: vehicle.sequence, plateNumber: vehicle.plateNumber })) : []
    const confirmed = confirmation.status === "current" ? groupPeople(confirmation.snapshot.assignments, vehicles) : []
    const [attendance, daily, personal, events, snapshot] = await Promise.all([
      manager.findBy(ExecutionAttendanceEntity, { tourSessionId: session.id }),
      manager.find(ExecutionDailyReportEntity, { where: { tourSessionId: session.id }, order: { reportDate: "ASC" } }),
      manager.find(ExecutionPersonDailyReportEntity, { where: { tourSessionId: session.id }, order: { reportDate: "ASC", personRef: "ASC" } }),
      manager.find(ExecutionEventEntity, { where: { tourSessionId: session.id }, order: { occurredAt: "ASC" } }),
      readTravelers(manager, session.id),
    ])
    const people = confirmed.map(person => {
      const row = attendance.find(candidate => candidate.personRef === person.personRef)
      return { ...person, attendance: row === undefined ? null : { status: row.status, infoChecked: row.infoChecked, groupJoined: row.groupJoined, updatedAt: row.updatedAt.toISOString() } }
    })
    return {
      id: session.id, code: session.code, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), vehicleIds: vehicles.map(vehicle => vehicle.id), confirmationStatus: confirmation.status, vehicles, people,
      personDailyReports: personal.map(row => ({ id: row.id, personRef: row.personRef, displayName: snapshot.sources.find(person => person.personRef === row.personRef)?.displayName ?? "", breakfast: row.breakfast, lunch: row.lunch, dinner: row.dinner, breakfastNote: row.breakfastNote, lunchNote: row.lunchNote, dinnerNote: row.dinnerNote, reportDate: row.reportDate, lodgingCheck: row.lodgingCheck, mealStatus: row.mealStatus, publicApproved: row.publicApproved, publicSummary: row.publicApproved ? row.publicSummary : "", version: row.version, updatedAt: row.updatedAt.toISOString() })),
      dailyReports: daily.map(row => ({ id: row.id, reportDate: row.reportDate, lodgingCheck: row.lodgingCheck, mealStatus: row.mealStatus, publicApproved: row.publicApproved, publicSummary: row.publicApproved ? row.publicSummary : "", updatedAt: row.updatedAt.toISOString() })),
      events: events.map(row => ({ id: row.id, personRef: row.personRef === null ? null : parsePersonRef(row.personRef), occurredAt: row.occurredAt.toISOString(), category: row.category, publicApproved: row.publicApproved, publicSummary: row.publicApproved ? row.publicSummary : "" })),
      counts: { present: people.filter(person => person.attendance?.status === "present").length, absent: people.filter(person => person.attendance?.status === "absent").length, revoked: people.filter(person => person.attendance?.status === "revoked").length, unrecorded: people.filter(person => person.attendance === null).length, personDailyReports: personal.length, approvedPersonDailyReports: personal.filter(row => row.publicApproved).length, events: events.length },
    }
  }

  async exportDetail(access: StaffAccess, sessionId: string): Promise<ExecutionManagementDetail> {
    const detail = await this.detail(access, sessionId)
    const manager = await this.assertManager(access)
    const session = await this.access.session(manager, access, sessionId)
    await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.export", targetType: "tour_session", targetId: sessionId })
    return detail
  }
}
