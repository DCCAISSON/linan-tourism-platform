import { randomUUID } from "node:crypto"
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In } from "typeorm"
import type { EntityManager } from "typeorm"
import { ExecutionAttendanceEntity } from "../../domain/entities/execution-attendance.entity.js"
import { ExecutionDailyReportEntity } from "../../domain/entities/execution-daily-report.entity.js"
import { ExecutionPersonDailyReportEntity } from "../../domain/entities/execution-person-daily-report.entity.js"
import { ExecutionEventEntity } from "../../domain/entities/execution-event.entity.js"
import { ExecutionHealthAuthorizationEntity } from "../../domain/entities/execution-health-authorization.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { TransportPersonAllocationEntity } from "../../domain/entities/transport-person-allocation.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { decryptPersonValue, encryptValue, PERSON_DATA_KEY_VERSION } from "../enrollment/person-data.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { findScopedOrder } from "../order/order.persistence.js"
import { readTravelers, resolveTraveler, toTravelerDto } from "../travelers/travelers.read-model.js"
import type { PersonRef, TravelerRecord } from "../travelers/travelers.types.js"
import { executionForbidden } from "./execution-access.policy.js"
import { ExecutionAccessService } from "./execution-access.service.js"
import { assertAttendanceTravelerWritable, assertHealthReadable } from "./execution-rules.js"
import { parsePersonRef } from "./execution.parser.js"
import type {
  AttendanceInput, AttendanceResponse, DailyReportInput, DailyReportResponse, EventInput, EventResponse,
  FamilyPublicSummary, GuidePersonResponse, GuideSessionResponse, GuideSessionSummary, HealthAuthorizationInput,
  HealthAuthorizationResponse, HealthReadResponse, PublicApprovalInput,
} from "./execution.types.js"

@Injectable()
export class ExecutionService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(ExecutionAccessService) private readonly accessService: ExecutionAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async listGuideSessions(access: StaffAccess): Promise<readonly GuideSessionSummary[]> {
    requireExecutionRead(access)
    const manager = (await this.database.getDataSource()).manager
    const sessionIds = await this.accessService.assignedSessionIds(access)
    if (sessionIds.length === 0) return []
    const sessions = await manager.find(TourSessionEntity, { where: { id: In([...sessionIds]) }, order: { startsAt: "ASC" } })
    const vehicles = await manager.findBy(TransportPersonAllocationEntity, { tourSessionId: In([...sessionIds]) })
    return sessions.map((session) => toSessionSummary(session, vehicles.filter((row) => row.tourSessionId === session.id).map((row) => row.vehicleId)))
  }

  async guideSession(access: StaffAccess, sessionId: string): Promise<GuideSessionResponse> {
    requireExecutionRead(access)
    const manager = (await this.database.getDataSource()).manager
    await this.accessService.assertAssignedIn(manager, access, { sessionId, vehicleId: undefined })
    return this.readGuideSession(manager, access, sessionId)
  }

  async saveAttendance(access: StaffAccess, sessionId: string, personRef: PersonRef, input: AttendanceInput): Promise<AttendanceResponse> {
    requireExecutionWrite(access)
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const { session, traveler, allocation } = await this.assertPersonAccess(manager, access, sessionId, personRef)
      assertAttendanceTravelerWritable(traveler, input.status)
      const previous = await manager.findOneBy(ExecutionAttendanceEntity, { tourSessionId: session.id, personRef })
      const row = previous ?? manager.create(ExecutionAttendanceEntity, { id: `att-${randomUUID()}` })
      row.tourSessionId = session.id
      row.vehicleId = allocation.vehicleId
      row.personRef = personRef
      row.status = input.status
      row.infoChecked = input.infoChecked
      row.groupJoined = input.groupJoined
      row.note = input.note
      row.updatedBy = access.actorId
      row.version = previous === null ? 1 : previous.version + 1
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: `execution.attendance.${input.status}`, targetType: "person", targetId: personRef })
      return toAttendance(saved)
    })
  }

  async saveDailyReport(access: StaffAccess, sessionId: string, input: DailyReportInput): Promise<DailyReportResponse> {
    requireExecutionWrite(access)
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.accessService.session(manager, access, sessionId)
      await this.accessService.assertAssignedIn(manager, access, { sessionId: session.id, vehicleId: undefined })
      const previous = await manager.findOneBy(ExecutionDailyReportEntity, { tourSessionId: session.id, reportDate: input.reportDate })
      const row = previous ?? manager.create(ExecutionDailyReportEntity, { id: `day-${randomUUID()}` })
      row.tourSessionId = session.id
      row.reportDate = input.reportDate
      row.lodgingCheck = input.lodgingCheck
      row.mealStatus = input.mealStatus
      row.bodyStatus = input.bodyStatus
      row.note = input.note
      row.updatedBy = access.actorId
      row.version = previous === null ? 1 : previous.version + 1
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.daily.write", targetType: "tour_session", targetId: session.id })
      return toDailyReport(saved)
    })
  }

  async createEvent(access: StaffAccess, sessionId: string, input: EventInput): Promise<EventResponse> {
    requireExecutionWrite(access)
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.accessService.session(manager, access, sessionId)
      if (input.personRef === null) await this.accessService.assertAssignedIn(manager, access, { sessionId: session.id, vehicleId: undefined })
      else await this.assertPersonAccess(manager, access, session.id, input.personRef)
      const row = manager.create(ExecutionEventEntity, {
        id: `evt-${randomUUID()}`, tourSessionId: session.id, personRef: input.personRef, category: input.category,
        occurredAt: input.occurredAt, content: input.content, publicSummary: "", publicApproved: false,
        createdBy: access.actorId, updatedBy: access.actorId, version: 1,
      })
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.event.write", targetType: "execution_event", targetId: saved.id })
      return toEvent(saved)
    })
  }

  async approveDailySummary(access: StaffAccess, sessionId: string, reportId: string, input: PublicApprovalInput): Promise<DailyReportResponse> {
    requireExecutionPublish(access)
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.accessService.session(manager, access, sessionId)
      const row = await manager.findOneBy(ExecutionDailyReportEntity, { id: reportId, tourSessionId: session.id })
      if (row === null) throw new NotFoundException({ code: "execution_daily_report_not_found", message: "日报不存在" })
      row.publicSummary = input.publicSummary
      row.publicApproved = true
      row.publicApprovedBy = access.actorId
      row.publicApprovedAt = new Date()
      row.updatedBy = access.actorId
      row.version += 1
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.daily.publish", targetType: "execution_daily_report", targetId: row.id })
      return toDailyReport(saved)
    })
  }

  async approveEventSummary(access: StaffAccess, sessionId: string, eventId: string, input: PublicApprovalInput): Promise<EventResponse> {
    requireExecutionPublish(access)
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.accessService.session(manager, access, sessionId)
      const row = await manager.findOneBy(ExecutionEventEntity, { id: eventId, tourSessionId: session.id })
      if (row === null) throw new NotFoundException({ code: "execution_event_not_found", message: "事件不存在" })
      row.publicSummary = input.publicSummary
      row.publicApproved = true
      row.publicApprovedBy = access.actorId
      row.publicApprovedAt = new Date()
      row.updatedBy = access.actorId
      row.version += 1
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.event.publish", targetType: "execution_event", targetId: row.id })
      return toEvent(saved)
    })
  }

  async familyPublicSummary(identity: EnrollmentIdentity, orderId: string): Promise<FamilyPublicSummary> {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    const tourSessionId = scoped.enrollment.tourSessionId
    const ownPeople = (await readTravelers(manager, tourSessionId)).sources.filter((person) => person.orderId === scoped.order.id)
    const ownRefs = new Set(ownPeople.map((person) => person.personRef))
    const [dailyReports, events] = await Promise.all([
      manager.find(ExecutionDailyReportEntity, { where: { tourSessionId, publicApproved: true }, order: { reportDate: "ASC" } }),
      manager.find(ExecutionEventEntity, { where: { tourSessionId, publicApproved: true }, order: { occurredAt: "ASC" } }),
    ])
    const personal = ownRefs.size === 0 ? [] : await manager.find(ExecutionPersonDailyReportEntity, { where: { tourSessionId, publicApproved: true, personRef: In([...ownRefs]) }, order: { reportDate: "ASC", personRef: "ASC" } })
    return { tourSessionId, personDailyReports: personal.map((row) => ({ personRef: row.personRef, displayName: ownPeople.find((person) => person.personRef === row.personRef)?.displayName ?? "", reportDate: row.reportDate, publicSummary: row.publicSummary })), dailyReports: dailyReports.map((row) => ({ reportDate: row.reportDate, publicSummary: row.publicSummary })), events: events.filter((row) => row.personRef === null || ownRefs.has(parsePersonRef(row.personRef))).map((row) => ({ occurredAt: row.occurredAt.toISOString(), category: row.category, publicSummary: row.publicSummary })) }
  }

  async authorizeHealth(identity: EnrollmentIdentity, orderId: string, input: HealthAuthorizationInput): Promise<HealthAuthorizationResponse> {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const scoped = await findScopedOrder(manager, identity, orderId)
      const snapshot = await readTravelers(manager, scoped.enrollment.tourSessionId)
      const traveler = resolveTraveler(snapshot, input.personRef)
      if (traveler.orderId !== scoped.order.id) throw executionForbidden("只能授权本订单人员的健康信息")
      const previous = await manager.findOneBy(ExecutionHealthAuthorizationEntity, { tourSessionId: scoped.enrollment.tourSessionId, personRef: input.personRef })
      const now = new Date()
      const row = previous ?? manager.create(ExecutionHealthAuthorizationEntity, { id: `hea-${randomUUID()}` })
      row.tourSessionId = scoped.enrollment.tourSessionId
      row.orderId = scoped.order.id
      row.personRef = input.personRef
      row.familyActorId = identity.actorId
      row.encryptedHealthJson = encryptValue(JSON.stringify({ allergies: input.allergies, medicalNotes: input.medicalNotes, emergencyMedicine: input.emergencyMedicine }))
      row.keyVersion = PERSON_DATA_KEY_VERSION
      row.authorizedAt = now
      row.revokedAt = null
      row.version = previous === null ? 1 : previous.version + 1
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: scoped.enrollment.organizationId, actorId: identity.actorId, action: "execution.health.authorize", targetType: "person", targetId: input.personRef })
      return toHealthAuthorization(saved)
    })
  }

  async revokeHealth(identity: EnrollmentIdentity, orderId: string, personRef: PersonRef): Promise<HealthAuthorizationResponse> {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const scoped = await findScopedOrder(manager, identity, orderId)
      const row = await manager.findOneBy(ExecutionHealthAuthorizationEntity, { tourSessionId: scoped.enrollment.tourSessionId, personRef })
      if (row === null || row.orderId !== scoped.order.id) throw new NotFoundException({ code: "execution_health_not_found", message: "健康授权不存在" })
      row.revokedAt = new Date()
      row.familyActorId = identity.actorId
      row.version += 1
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: scoped.enrollment.organizationId, actorId: identity.actorId, action: "execution.health.revoke", targetType: "person", targetId: personRef })
      return toHealthAuthorization(saved)
    })
  }

  async readHealth(access: StaffAccess, sessionId: string, personRef: PersonRef): Promise<HealthReadResponse> {
    requireHealthRead(access)
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const { session } = await this.assertPersonAccess(manager, access, sessionId, personRef)
      const row = await manager.findOneBy(ExecutionHealthAuthorizationEntity, { tourSessionId: session.id, personRef })
      assertHealthReadable(access, row)
      const health = JSON.parse(decryptPersonValue(row.encryptedHealthJson, row.keyVersion)) as Omit<HealthAuthorizationInput, "personRef">
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.health.read", targetType: "person", targetId: personRef })
      return { ...toHealthAuthorization(row), health }
    })
  }

  private async readGuideSession(manager: EntityManager, access: StaffAccess, sessionId: string): Promise<GuideSessionResponse> {
    const session = await this.accessService.session(manager, access, sessionId)
    const allocations = await manager.findBy(TransportPersonAllocationEntity, { tourSessionId: session.id })
    const allowed: TransportPersonAllocationEntity[] = []
    for (const allocation of allocations) {
      try {
        await this.accessService.assertAssignedIn(manager, access, { sessionId: session.id, vehicleId: allocation.vehicleId })
        allowed.push(allocation)
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error
      }
    }
    const allowedRefs = new Set(allowed.map((row) => row.personRef))
    const snapshot = await readTravelers(manager, session.id)
    const [attendance, healthRows, dailyReports, events] = await Promise.all([
      manager.findBy(ExecutionAttendanceEntity, { tourSessionId: session.id }),
      manager.findBy(ExecutionHealthAuthorizationEntity, { tourSessionId: session.id }),
      manager.find(ExecutionDailyReportEntity, { where: { tourSessionId: session.id }, order: { reportDate: "ASC" } }),
      manager.find(ExecutionEventEntity, { where: { tourSessionId: session.id }, order: { occurredAt: "ASC" } }),
    ])
    return {
      ...toSessionSummary(session, allowed.map((row) => row.vehicleId)),
      people: snapshot.travelers.filter((row) => allowedRefs.has(row.personRef)).map((row) => toGuidePerson(row, allowed, attendance, healthRows)),
      dailyReports: dailyReports.map(toDailyReport),
      events: events.map(toEvent),
    }
  }

  private async assertPersonAccess(manager: EntityManager, access: StaffAccess, sessionId: string, personRef: PersonRef) {
    const session = await this.accessService.session(manager, access, sessionId)
    const snapshot = await readTravelers(manager, session.id)
    const traveler = resolveTraveler(snapshot, personRef)
    const allocation = await manager.findOneBy(TransportPersonAllocationEntity, { tourSessionId: session.id, personRef })
    if (allocation === null) throw new ConflictException({ code: "execution_vehicle_required", message: "人员尚未分配到当前车辆" })
    await this.accessService.assertAssignedIn(manager, access, { sessionId: session.id, vehicleId: allocation.vehicleId })
    return { session, traveler, allocation }
  }
}

function requireExecutionRead(access: StaffAccess): void {
  if (!access.permissionKeys.has("execution.read")) throw new ForbiddenException({ code: "execution_read_forbidden", message: "无权查看执行信息" })
}
function requireExecutionWrite(access: StaffAccess): void {
  if (!access.permissionKeys.has("execution.write")) throw new ForbiddenException({ code: "execution_write_forbidden", message: "无权填写执行信息" })
}
function requireExecutionPublish(access: StaffAccess): void {
  if (!access.permissionKeys.has("execution.publish")) throw new ForbiddenException({ code: "execution_publish_forbidden", message: "无权批准公开摘要" })
}
function requireHealthRead(access: StaffAccess): void {
  if (!access.permissionKeys.has("health.read")) throw new ForbiddenException({ code: "health_read_forbidden", message: "无权读取健康原文" })
}
function toSessionSummary(session: TourSessionEntity, vehicleIds: readonly string[]): GuideSessionSummary {
  return { id: session.id, code: session.code, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), vehicleIds: [...new Set(vehicleIds)].sort() }
}
function toGuidePerson(row: TravelerRecord, allocations: readonly TransportPersonAllocationEntity[], attendance: readonly ExecutionAttendanceEntity[], health: readonly ExecutionHealthAuthorizationEntity[]): GuidePersonResponse {
  const allocation = allocations.find((candidate) => candidate.personRef === row.personRef)
  if (allocation === undefined) throw new Error("execution allocation missing")
  const attendanceRow = attendance.find((candidate) => candidate.personRef === row.personRef) ?? null
  const healthRow = health.find((candidate) => candidate.personRef === row.personRef && candidate.revokedAt === null)
  return { ...toTravelerDto(row), vehicleId: allocation.vehicleId, attendance: attendanceRow === null ? null : toAttendance(attendanceRow), healthAuthorized: healthRow !== undefined }
}
function toAttendance(row: ExecutionAttendanceEntity): AttendanceResponse {
  return { id: row.id, tourSessionId: row.tourSessionId, vehicleId: row.vehicleId, personRef: row.personRef as PersonRef, status: row.status, infoChecked: row.infoChecked, groupJoined: row.groupJoined, note: row.note, version: row.version, updatedAt: row.updatedAt.toISOString() }
}
function toDailyReport(row: ExecutionDailyReportEntity): DailyReportResponse {
  return { id: row.id, tourSessionId: row.tourSessionId, reportDate: row.reportDate, lodgingCheck: row.lodgingCheck, mealStatus: row.mealStatus, bodyStatus: row.bodyStatus, note: row.note, publicSummary: row.publicSummary, publicApproved: row.publicApproved, version: row.version, updatedAt: row.updatedAt.toISOString() }
}
function toEvent(row: ExecutionEventEntity): EventResponse {
  return { id: row.id, tourSessionId: row.tourSessionId, category: row.category, occurredAt: row.occurredAt.toISOString(), personRef: row.personRef as PersonRef | null, content: row.content, publicSummary: row.publicSummary, publicApproved: row.publicApproved, version: row.version, updatedAt: row.updatedAt.toISOString() }
}
function toHealthAuthorization(row: ExecutionHealthAuthorizationEntity): HealthAuthorizationResponse {
  return { id: row.id, tourSessionId: row.tourSessionId, orderId: row.orderId, personRef: row.personRef as PersonRef, active: row.revokedAt === null, version: row.version, authorizedAt: row.authorizedAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null }
}
