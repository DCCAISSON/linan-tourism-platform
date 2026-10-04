import { ORDER_STATUS, PAYMENT_STATUS, ROSTER_STATUS } from "@linan/contracts"
import { ForbiddenException, Inject, Injectable } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { TourSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { rosterSessionNotFound } from "./roster.errors.js"
import type { RosterExportRow } from "./roster.workbook.js"
import type { PaymentSummary, RosterFilters, RosterQueryFilters, RosterRow, RosterSummary } from "./roster.types.js"
import { decryptPersonValue } from "../enrollment/person-data.js"

type RosterRecord = RosterExportRow & {
  readonly identityCiphertext: string | null
  readonly phoneCiphertext: string | null
  readonly personDataKeyVersion: string | null
}
type TotalRecord = { readonly paidHeadcount: number | string | null; readonly paidAmountFen: number | string | null }
type SqlParts = { readonly where: string; readonly params: readonly unknown[] }

@Injectable()
export class RosterService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  async summarize(access: StaffAccess, filters: RosterQueryFilters): Promise<RosterSummary> {
    const manager = (await this.database.getDataSource()).manager
    const session = await manager.findOneBy(TourSessionEntity, { id: filters.tourSessionId })
    if (session === null) {
      throw rosterSessionNotFound()
    }
    const resolvedFilters = { ...filters, schoolId: filters.schoolId ?? session.organizationId }
    this.staffAccess.assertRosterSummaryScope(access, {
      schoolId: session.organizationId,
      requestedSchoolId: filters.schoolId,
      requestedClassId: filters.classId,
      tourSessionId: session.id,
    })

    const totals = await this.loadTotals(manager, resolvedFilters)
    const rows = await this.loadRows(manager, resolvedFilters)
    return {
      filters: publicFilters(resolvedFilters),
      paidHeadcount: readNumber(totals[0]?.paidHeadcount),
      paidAmountFen: readNumber(totals[0]?.paidAmountFen),
      rows: rows.map(toSummaryRow),
    }
  }

  async paymentSummary(access: StaffAccess, filters: RosterQueryFilters): Promise<PaymentSummary> {
    const manager = (await this.database.getDataSource()).manager
    const session = await manager.findOneBy(TourSessionEntity, { id: filters.tourSessionId })
    if (session === null) {
      throw rosterSessionNotFound()
    }
    this.staffAccess.assertPaymentSummaryScope(access)
    const resolvedFilters = { ...filters, schoolId: filters.schoolId ?? session.organizationId }
    const totals = await this.loadTotals(manager, resolvedFilters)
    return {
      filters: publicFilters(resolvedFilters),
      paidHeadcount: readNumber(totals[0]?.paidHeadcount),
      paidAmountFen: readNumber(totals[0]?.paidAmountFen),
    }
  }

  async listExportRows(access: StaffAccess, filters: RosterQueryFilters): Promise<readonly RosterExportRow[]> {
    const manager = (await this.database.getDataSource()).manager
    const session = await manager.findOneBy(TourSessionEntity, { id: filters.tourSessionId })
    if (session === null) {
      throw rosterSessionNotFound()
    }
    const resolvedFilters = { ...filters, schoolId: filters.schoolId ?? session.organizationId }
    const scope = {
      schoolId: session.organizationId,
      requestedSchoolId: filters.schoolId,
      requestedClassId: filters.classId,
      tourSessionId: session.id,
    }
    try {
      this.staffAccess.assertRosterExportScope(access, scope)
    } catch (error) {
      await this.recordExport(manager, access, session.organizationId, session.id, "roster.export.denied")
      throw error
    }

    if (filters.includeSensitive) {
      assertSensitiveExport(access)
    }
    const rows = await this.loadRows(manager, resolvedFilters)
    await this.recordExport(manager, access, session.organizationId, session.id, "roster.exported")
    return filters.includeSensitive ? rows.map(withSensitiveValues) : rows.map(withoutSensitiveValues)
  }

  private async loadRows(manager: EntityManager, filters: RosterFilters): Promise<readonly RosterExportRow[]> {
    const sql = buildSqlParts(filters)
    const rows: readonly RosterRecord[] = await manager.query(`
      select
        ep.id as participantId,
        ol.display_name_snapshot as displayName,
        ol.identity_ciphertext_snapshot as identityCiphertext,
        ol.phone_ciphertext_snapshot as phoneCiphertext,
        ol.person_data_key_version_snapshot as personDataKeyVersion,
        org.id as schoolId,
        org.name as schoolName,
        coalesce(ep.grade_id_snapshot, fm.grade_id) as gradeId,
        coalesce(ol.grade_name_snapshot, sg.name) as gradeName,
        coalesce(ep.class_id_snapshot, fm.class_id) as classId,
        coalesce(ol.class_name_snapshot, sc.name) as className,
        ol.amount_fen as amountFen,
        e.code as enrollmentCode,
        o.code as orderCode,
        re.status as rosterStatus
      from order_lines ol
      join orders o on o.id = ol.order_id
      join enrollments e on e.id = o.enrollment_id
      join enrollment_participants ep on ep.id = ol.enrollment_participant_id
      join family_members fm on fm.id = ep.family_member_id
      join organizations org on org.id = ol.organization_id
      left join school_grades sg on sg.id = coalesce(ep.grade_id_snapshot, fm.grade_id)
      left join school_classes sc on sc.id = coalesce(ep.class_id_snapshot, fm.class_id)
      join roster_entries re on re.enrollment_participant_id = ep.id and re.enrollment_id = e.id
      ${sql.where}
      order by org.name, sg.name, sc.name, ol.display_name_snapshot, ol.id
    `, sql.params)
    return rows.map(normalizeExportRow)
  }

  private async loadTotals(manager: EntityManager, filters: RosterFilters): Promise<readonly TotalRecord[]> {
    const sql = buildSqlParts(filters)
    return manager.query(`
      select count(*) as paidHeadcount, coalesce(sum(ol.amount_fen), 0) as paidAmountFen
      from order_lines ol
      join orders o on o.id = ol.order_id
      join enrollments e on e.id = o.enrollment_id
      join enrollment_participants ep on ep.id = ol.enrollment_participant_id
      join family_members fm on fm.id = ep.family_member_id
      join roster_entries re on re.enrollment_participant_id = ep.id and re.enrollment_id = e.id
      ${sql.where}
    `, sql.params)
  }

  private async recordExport(
    manager: EntityManager,
    access: StaffAccess,
    organizationId: string,
    targetId: string,
    action: string,
  ): Promise<void> {
    await this.audit.record(manager, {
      organizationId,
      actorId: access.actorId,
      action,
      targetType: "tour_session",
      targetId,
    })
  }
}

function buildSqlParts(filters: RosterFilters): SqlParts {
  const clauses = [
    "where e.tour_session_id = ?",
    "and o.status = ?",
    "and exists (select 1 from payments p where p.order_id = o.id and p.status = ?)",
    "and re.status != ?",
  ]
  const params: unknown[] = [filters.tourSessionId, ORDER_STATUS.paid, PAYMENT_STATUS.succeeded, ROSTER_STATUS.cancelled]
  if (filters.schoolId !== null) {
    clauses.push("and ol.organization_id = ?")
    params.push(filters.schoolId)
  }
  if (filters.gradeId !== null) {
    clauses.push("and coalesce(ep.grade_id_snapshot, fm.grade_id) = ?")
    params.push(filters.gradeId)
  }
  if (filters.classId !== null) {
    clauses.push("and coalesce(ep.class_id_snapshot, fm.class_id) = ?")
    params.push(filters.classId)
  }
  return { where: clauses.join("\n"), params }
}

function normalizeExportRow(row: RosterRecord): RosterExportRow {
  return {
    participantId: row.participantId,
    displayName: row.displayName,
    schoolId: row.schoolId,
    schoolName: row.schoolName,
    gradeId: row.gradeId,
    gradeName: row.gradeName,
    classId: row.classId,
    className: row.className,
    amountFen: readNumber(row.amountFen),
    identityNumber: null,
    phone: null,
    identityCiphertext: row.identityCiphertext,
    phoneCiphertext: row.phoneCiphertext,
    personDataKeyVersion: row.personDataKeyVersion,
    enrollmentCode: row.enrollmentCode,
    orderCode: row.orderCode,
    rosterStatus: row.rosterStatus,
  }
}

function toSummaryRow(row: RosterExportRow): RosterRow {
  return {
    participantId: row.participantId,
    displayName: row.displayName,
    schoolId: row.schoolId,
    schoolName: row.schoolName,
    gradeId: row.gradeId,
    gradeName: row.gradeName,
    classId: row.classId,
    className: row.className,
    amountFen: row.amountFen,
  }
}

function publicFilters(filters: RosterQueryFilters): RosterFilters {
  return {
    tourSessionId: filters.tourSessionId,
    schoolId: filters.schoolId,
    gradeId: filters.gradeId,
    classId: filters.classId,
  }
}

function assertSensitiveExport(access: StaffAccess): void {
  if (access.permissionKeys.has("roster.export_sensitive") && access.permissionKeys.has("sensitive_data.read")) {
    return
  }
  throw new ForbiddenException({ code: "staff_scope_forbidden", message: "staff identity cannot export sensitive roster data" })
}

function withSensitiveValues(row: RosterExportRow): RosterExportRow {
  if (row.identityCiphertext === null || row.phoneCiphertext === null || row.personDataKeyVersion === null) {
    return row
  }
  return {
    ...row,
    identityNumber: decryptPersonValue(row.identityCiphertext, row.personDataKeyVersion),
    phone: decryptPersonValue(row.phoneCiphertext, row.personDataKeyVersion),
  }
}

function withoutSensitiveValues(row: RosterExportRow): RosterExportRow {
  return { ...row, identityNumber: null, phone: null }
}

function readNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }
  return Number(value)
}
