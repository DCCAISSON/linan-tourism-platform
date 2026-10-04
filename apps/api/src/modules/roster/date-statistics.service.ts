import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common"
import { In, Raw } from "typeorm"
import { TourSessionEntity, OrganizationEntity } from "../../domain/entities/index.js"
import { ExecutionAttendanceEntity } from "../../domain/entities/execution-attendance.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { readTransportConfirmation } from "../transport/transport-confirmation.read.js"
import { RosterService } from "./roster.service.js"

export type DateStatisticsFilters = { readonly from: string; readonly until: string; readonly schoolId: string | null }
export type DateStatisticsRow = { readonly sessionId: string; readonly code: string; readonly schoolName: string; readonly startsAt: string; readonly paidHeadcount: number; readonly paymentAmountFen: number; readonly refundAmountFen: number; readonly presentHeadcount: number; readonly confirmationMissing: boolean; readonly attendanceIncomplete: boolean }

export function parseDateStatisticsFilters(value: unknown): DateStatisticsFilters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalidDates()
  const input = Object.fromEntries(Object.entries(value))
  if (Object.keys(input).some(key => !["from", "until", "schoolId"].includes(key))) throw invalidDates()
  const from = dateValue(input["from"]), until = dateValue(input["until"])
  if (from > until) throw invalidDates()
  const schoolId = input["schoolId"]
  if (schoolId !== undefined && (typeof schoolId !== "string" || !/^[\w-]{1,80}$/.test(schoolId))) throw invalidDates()
  return { from, until, schoolId: schoolId ?? null }
}
function dateValue(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidDates()
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalidDates()
  return value
}
function invalidDates(): BadRequestException { return new BadRequestException({ code: "statistics_dates_invalid", message: "请选择有效的起止日期，结束日期不能早于开始日期。" }) }

@Injectable()
export class DateStatisticsService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
    @Inject(RosterService) private readonly roster: RosterService,
  ) {}

  async summarize(staff: StaffAccess, filters: DateStatisticsFilters) {
    this.access.assertPaymentSummaryScope(staff)
    if (!staff.permissionKeys.has("roster.read") || !staff.permissionKeys.has("execution.read")) throw new ForbiddenException({ code: "statistics_forbidden", message: "无权查看名单与执行汇总。" })
    const manager = (await this.database.getDataSource()).manager
    const from = new Date(`${filters.from}T00:00:00+08:00`)
    const until = new Date(new Date(`${filters.until}T00:00:00+08:00`).getTime() + 86400000)
    const sessions = await manager.find(TourSessionEntity, { where: { startsAt: Raw(column => `${column} >= :from and ${column} < :until`, { from, until }), ...(filters.schoolId === null ? {} : { organizationId: filters.schoolId }) }, order: { startsAt: "ASC", id: "ASC" } })
    const schools = sessions.length === 0 ? [] : await manager.findBy(OrganizationEntity, { id: In(sessions.map(session => session.organizationId)) })
    const rows: DateStatisticsRow[] = []
    for (const session of sessions) {
      const paid = await this.roster.paymentSummary(staff, { tourSessionId: session.id, schoolId: session.organizationId, gradeId: null, classId: null, includeSensitive: false })
      const payment: readonly { amount: string | number }[] = await manager.query(`select coalesce(sum(p.amount_fen), 0) as amount from payments p join orders o on o.id=p.order_id join enrollments e on e.id=o.enrollment_id where e.tour_session_id=? and p.status in ('succeeded', 'refunded')`, [session.id])
      const refund: readonly { amount: string | number }[] = await manager.query(`select coalesce(sum(r.amount_fen), 0) as amount from refund_requests r join orders o on o.id=r.order_id join enrollments e on e.id=o.enrollment_id where e.tour_session_id=? and r.status='succeeded'`, [session.id])
      const confirmation = await readTransportConfirmation(manager, session.id)
      const attendance = await manager.findBy(ExecutionAttendanceEntity, { tourSessionId: session.id })
      const confirmedRefs = confirmation.status === "current" ? new Set(confirmation.snapshot.assignments.map(person => person.personRef)) : new Set<string>()
      const current = attendance.filter(person => confirmedRefs.has(person.personRef))
      rows.push({ sessionId: session.id, code: session.code, schoolName: schools.find(school => school.id === session.organizationId)?.name ?? "", startsAt: session.startsAt.toISOString(), paidHeadcount: paid.paidHeadcount, paymentAmountFen: Number(payment[0]?.amount ?? 0), refundAmountFen: Number(refund[0]?.amount ?? 0), presentHeadcount: current.filter(person => person.status === "present").length, confirmationMissing: confirmation.status !== "current", attendanceIncomplete: confirmation.status !== "current" || current.length < confirmedRefs.size })
    }
    return { filters, rows, totals: rows.reduce((sum, row) => ({ paidHeadcount: sum.paidHeadcount + row.paidHeadcount, paymentAmountFen: sum.paymentAmountFen + row.paymentAmountFen, refundAmountFen: sum.refundAmountFen + row.refundAmountFen, presentHeadcount: sum.presentHeadcount + row.presentHeadcount, confirmationMissing: sum.confirmationMissing + Number(row.confirmationMissing), attendanceIncomplete: sum.attendanceIncomplete + Number(row.attendanceIncomplete) }), { paidHeadcount: 0, paymentAmountFen: 0, refundAmountFen: 0, presentHeadcount: 0, confirmationMissing: 0, attendanceIncomplete: 0 }) }
  }
}
