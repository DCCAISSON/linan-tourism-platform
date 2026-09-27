import { randomUUID } from "node:crypto"
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { ExecutionPersonDailyReportEntity } from "../../domain/entities/execution-person-daily-report.entity.js"
import { ExecutionHealthAuthorizationEntity } from "../../domain/entities/execution-health-authorization.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { decryptPersonValue, encryptValue, PERSON_DATA_KEY_VERSION } from "../enrollment/person-data.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertTravelerActionable, readTravelers, resolveTraveler } from "../travelers/travelers.read-model.js"
import type { PersonRef } from "../travelers/travelers.types.js"
import { ExecutionAccessService } from "./execution-access.service.js"
import { assertHealthReadable } from "./execution-rules.js"
import { readConfirmedPerson } from "./execution-confirmed-person.js"
import { lockTransportPlan } from "../transport/transport-plan-store.js"
import { readTransportConfirmation } from "../transport/transport-confirmation.read.js"
import type { parsePersonDailyInput, parsePersonDailyApproval } from "./execution.parser.js"

type DailyTarget = { readonly sessionId: string; readonly personRef: PersonRef }
type DailyInput = ReturnType<typeof parsePersonDailyInput>
type DailyApproval = ReturnType<typeof parsePersonDailyApproval>

@Injectable()
export class PersonDailyService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(ExecutionAccessService) private readonly access: ExecutionAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async list(access: StaffAccess, sessionId: string) {
    if (!access.permissionKeys.has("execution.read")) throw new ForbiddenException("无权查看执行信息")
    const manager = (await this.database.getDataSource()).manager
    const session = await this.access.session(manager, access, sessionId)
    const administrative = this.isManager(access)
    if (!administrative) await this.access.assertAssignedIn(manager, access, { sessionId, vehicleId: undefined })
    const rows = await manager.find(ExecutionPersonDailyReportEntity, { where: { tourSessionId: sessionId }, order: { reportDate: "ASC", personRef: "ASC" } })
    const visible = []
    for (const row of rows) {
      try { await this.personAccess(manager, access, { sessionId, personRef: row.personRef }) }
      catch (error) { if (error instanceof ForbiddenException || error instanceof ConflictException || error instanceof NotFoundException) continue; throw error }
      const health = await this.canReadHealth(manager, access, row)
      visible.push(this.response(row, health))
      if (health) await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.person_daily.health.read", targetType: "person", targetId: row.personRef })
    }
    return visible
  }

  async save(access: StaffAccess, target: DailyTarget, input: DailyInput) {
    if (!access.permissionKeys.has("execution.write")) throw new ForbiddenException("无权填写执行信息")
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      await lockTransportPlan(manager, target.sessionId)
      const { session, traveler } = await this.personAccess(manager, access, target)
      assertTravelerActionable(traveler)
      const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
      if (input.reportDate < localDate.format(session.startsAt) || input.reportDate > localDate.format(session.endsAt)) throw new BadRequestException({ code: "execution_daily_date_outside_session", message: "日报日期须在团期内" })
      const health = await manager.findOneBy(ExecutionHealthAuthorizationEntity, { tourSessionId: session.id, personRef: target.personRef })
      const readable = await this.canReadHealth(manager, access, { tourSessionId: session.id, personRef: target.personRef })
      if (input.bodyStatus.length > 0 || input.note.length > 0) {
        assertHealthReadable(access, health)
        if (!readable) throw new ForbiddenException("健康信息仅限获指派人员处理")
      }
      const key = { tourSessionId: session.id, personRef: target.personRef, reportDate: input.reportDate }
      await manager.findOneOrFail(TourSessionEntity, { where: { id: session.id }, lock: { mode: "pessimistic_write" } })
      const previous = await manager.findOne(ExecutionPersonDailyReportEntity, { where: key, lock: { mode: "pessimistic_write" } })
      if ((previous?.version ?? 0) !== input.expectedVersion) throw versionConflict()
      const row = previous ?? manager.create(ExecutionPersonDailyReportEntity, { id: `pday-${randomUUID()}`, ...key })
      row.lodgingCheck = input.lodgingCheck
      row.mealStatus = input.mealStatus
      if (readable || previous === null) {
        row.encryptedBodyStatus = input.bodyStatus.length === 0 ? "" : encryptValue(input.bodyStatus)
        row.encryptedNote = input.note.length === 0 ? "" : encryptValue(input.note)
        row.keyVersion = PERSON_DATA_KEY_VERSION
      }
      row.publicSummary = ""
      row.publicApproved = false
      row.publicApprovedBy = null
      row.publicApprovedAt = null
      row.updatedBy = access.actorId
      row.version = input.expectedVersion + 1
      const saved = await manager.save(row)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.person_daily.write", targetType: "execution_person_daily_report", targetId: saved.id })
      return this.response(saved, readable)
    })
  }

  async approve(access: StaffAccess, target: { readonly sessionId: string; readonly reportId: string }, input: DailyApproval) {
    if (!access.permissionKeys.has("execution.publish")) throw new ForbiddenException("无权批准公开摘要")
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.access.session(manager, access, target.sessionId)
      const row = await manager.findOne(ExecutionPersonDailyReportEntity, { where: { id: target.reportId, tourSessionId: session.id }, lock: { mode: "pessimistic_write" } })
      if (row === null) throw new NotFoundException({ code: "execution_daily_report_not_found", message: "日报不存在" })
      if (row.version !== input.expectedVersion) throw versionConflict()
      row.publicSummary = input.publicSummary
      row.publicApproved = true
      row.publicApprovedBy = access.actorId
      row.publicApprovedAt = new Date()
      row.updatedBy = access.actorId
      row.version += 1
      await manager.save(row)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.person_daily.publish", targetType: "execution_person_daily_report", targetId: row.id })
      return this.response(row, false)
    })
  }

  private isManager(access: StaffAccess): boolean {
    return access.kind === "administrator" && access.permissionKeys.has("execution.manage")
  }

  private async personAccess(manager: EntityManager, access: StaffAccess, target: DailyTarget) {
    const session = await this.access.session(manager, access, target.sessionId)
    const allocation = await readConfirmedPerson(manager, target)
    const traveler = resolveTraveler(await readTravelers(manager, session.id), target.personRef)
    if (!this.isManager(access)) {
      await this.access.assertAssignedIn(manager, access, { sessionId: session.id, vehicleId: allocation.vehicleId })
    }
    return { session, traveler }
  }

  private async canReadHealth(manager: EntityManager, access: StaffAccess, row: { readonly tourSessionId: string; readonly personRef: PersonRef }): Promise<boolean> {
    if (!access.permissionKeys.has("health.read")) return false
    const authorization = await manager.findOneBy(ExecutionHealthAuthorizationEntity, { tourSessionId: row.tourSessionId, personRef: row.personRef })
    if (authorization === null || authorization.revokedAt !== null) return false
    const confirmation = await readTransportConfirmation(manager, row.tourSessionId)
    if (confirmation.status !== "current") return false
    const allocation = confirmation.snapshot.assignments.find(person => person.personRef === row.personRef)
    if (allocation === undefined) return false
    try { await this.access.assertAssignedIn(manager, access, { sessionId: row.tourSessionId, vehicleId: allocation.vehicleId }); return true }
    catch (error) { if (error instanceof ForbiddenException) return false; throw error }
  }

  private response(row: ExecutionPersonDailyReportEntity, healthReadable: boolean) {
    return { id: row.id, tourSessionId: row.tourSessionId, personRef: row.personRef, reportDate: row.reportDate, lodgingCheck: row.lodgingCheck, mealStatus: row.mealStatus,
      bodyStatus: healthReadable && row.encryptedBodyStatus !== "" ? decryptPersonValue(row.encryptedBodyStatus, row.keyVersion) : "",
      note: healthReadable && row.encryptedNote !== "" ? decryptPersonValue(row.encryptedNote, row.keyVersion) : "", healthReadable,
      publicSummary: row.publicSummary, publicApproved: row.publicApproved, version: row.version, updatedAt: row.updatedAt.toISOString() }
  }
}

function versionConflict(): ConflictException {
  return new ConflictException({ code: "execution_daily_version_conflict", message: "日报已更新，请刷新后重试" })
}
