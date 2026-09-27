import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { EvaluationStandardEntity } from "../../domain/entities/evaluation-standard.entity.js"
import { StudentEvaluationEntity } from "../../domain/entities/student-evaluation.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"
import { assertTravelerActionable, readTravelers, resolveTraveler } from "../travelers/travelers.read-model.js"
import type { PersonRef, TravelerRecord } from "../travelers/travelers.types.js"
import { createSchoolEvaluationWorkbook, createSchoolEvaluationWordXml } from "./evaluation-report.js"
import { assertEvaluationPermission, canReadSchoolEvaluations, filterSchoolConfirmedGrades } from "./evaluations.policy.js"
import type {
  BatchEvaluationInput,
  EvaluationDashboard,
  EvaluationGradeCode,
  EvaluationRevisionInput,
  EvaluationStandardInput,
  EvaluationStandardSummary,
  EvaluationSummaryRow,
  SchoolEvaluationRow,
  StandardConfirmationInput,
  StandardItemInput,
} from "./evaluations.types.js"

@Injectable()
export class EvaluationsService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(ExecutionAccessService) private readonly execution: ExecutionAccessService,
  ) {}

  async standards(staff: StaffAccess, tourSessionId: string): Promise<readonly EvaluationStandardSummary[]> {
    const permission = staff.permissionKeys.has("evaluations.standard.write") ? "evaluations.standard.write" : "evaluations.standard.confirm"
    assertEvaluationPermission(staff, permission)
    const db = await this.database.getDataSource()
    await assertStaffSession(db.manager, staff, tourSessionId)
    const rows = await db.manager.find(EvaluationStandardEntity, { where: { tourSessionId }, order: { createdAt: "DESC" } })
    return rows.map(toStandardSummary)
  }

  async dashboard(staff: StaffAccess, tourSessionId: string): Promise<EvaluationDashboard> {
    assertEvaluationPermission(staff, "evaluations.read")
    const db = await this.database.getDataSource()
    const session = await assertStaffSession(db.manager, staff, tourSessionId)
    if (staff.kind === "guide") await this.execution.assertAssigned(staff, tourSessionId)
    const [standards, evaluations, snapshot] = await Promise.all([
      db.manager.find(EvaluationStandardEntity, { where: { tourSessionId }, order: { createdAt: "DESC" } }),
      db.manager.find(StudentEvaluationEntity, { where: { tourSessionId }, order: { updatedAt: "DESC" } }),
      readTravelers(db.manager, tourSessionId),
    ])
    const students = snapshot.travelers.filter((row) => row.active && row.conflict === null && (row.participantKind === "student" || row.importedRole === "student"))
      .map(({ personRef, displayName, gradeName, className }) => ({ personRef, displayName, gradeName, className }))
    return { organizationId: session.organizationId, students, standards: standards.map(toStandardSummary), evaluations: evaluations.map(toSummaryRow) }
  }

  async createStandard(staff: StaffAccess, input: EvaluationStandardInput): Promise<EvaluationStandardSummary> {
    assertEvaluationPermission(staff, "evaluations.standard.write")
    const db = await this.database.getDataSource()
    await assertStaffSession(db.manager, staff, input.tourSessionId)
    const row = await db.manager.save(EvaluationStandardEntity, {
      id: makeId("evalstd"),
      tourSessionId: input.tourSessionId,
      title: input.title,
      items: [...input.items],
      publicFormatNote: input.publicFormatNote,
      createdByStaffId: staff.actorId,
    })
    return toStandardSummary(row)
  }

  async confirmStandard(staff: StaffAccess, id: string, input: StandardConfirmationInput): Promise<EvaluationStandardSummary> {
    assertEvaluationPermission(staff, "evaluations.standard.confirm")
    const db = await this.database.getDataSource()
    return db.transaction(async (manager) => {
      const standard = await manager.findOne(EvaluationStandardEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
      if (standard === null) throw new NotFoundException({ code: "evaluation_standard_not_found", message: "standard not found" })
      await assertStaffSession(manager, staff, standard.tourSessionId)
      if (standard.version !== input.expectedVersion) throw stale()
      assertStandardHasAB(standard.items)
      standard.confirmedAt = new Date()
      standard.confirmedByStaffId = staff.actorId
      standard.version += 1
      return toStandardSummary(await manager.save(standard))
    })
  }

  async batchEvaluate(staff: StaffAccess, input: BatchEvaluationInput): Promise<readonly EvaluationSummaryRow[]> {
    assertEvaluationPermission(staff, "evaluations.write")
    const db = await this.database.getDataSource()
    if (staff.kind === "guide") await this.execution.assertAssigned(staff, input.tourSessionId)
    return db.transaction(async (manager) => {
      await assertStaffSession(manager, staff, input.tourSessionId)
      const standard = input.standardId === null ? null : await confirmedStandard(manager, input.standardId, input.tourSessionId)
      const snapshot = await readTravelers(manager, input.tourSessionId)
      const rows: StudentEvaluationEntity[] = []
      for (const observation of input.observations) {
        const traveler = resolveTraveler(snapshot, observation.personRef)
        assertTravelerActionable(traveler)
        rows.push(await upsertEvaluation(manager, staff, traveler, {
          standard,
          idempotencyKey: input.idempotencyKey,
          internalComment: observation.internalComment,
          excellent: observation.excellent,
          attention: observation.attention,
          gradeCode: observation.gradeCode,
        }))
      }
      return rows.map(toSummaryRow)
    })
  }

  async revise(staff: StaffAccess, id: string, input: EvaluationRevisionInput): Promise<EvaluationSummaryRow> {
    assertEvaluationPermission(staff, "evaluations.write")
    const db = await this.database.getDataSource()
    return db.transaction(async (manager) => {
      const row = await manager.findOne(StudentEvaluationEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
      if (row === null) throw new NotFoundException({ code: "evaluation_not_found", message: "evaluation not found" })
      if (staff.kind === "guide") await this.execution.assertAssignedIn(manager, staff, { sessionId: row.tourSessionId, vehicleId: undefined })
      await assertStaffSession(manager, staff, row.tourSessionId)
      if (row.version !== input.expectedVersion) throw stale()
      const standard = row.standardId === null ? null : await confirmedStandard(manager, row.standardId, row.tourSessionId)
      applyGrade(row, standard, input.gradeCode)
      row.internalComment = input.internalComment
      row.excellent = input.excellent
      row.attention = input.attention
      row.updatedByStaffId = staff.actorId
      row.confirmedAt = null
      row.confirmedByStaffId = null
      row.version += 1
      return toSummaryRow(await manager.save(row))
    })
  }

  async confirmSession(staff: StaffAccess, tourSessionId: string): Promise<readonly EvaluationSummaryRow[]> {
    assertEvaluationPermission(staff, "evaluations.confirm")
    const db = await this.database.getDataSource()
    return db.transaction(async (manager) => {
      await assertStaffSession(manager, staff, tourSessionId)
      const rows = await manager.findBy(StudentEvaluationEntity, { tourSessionId })
      for (const row of rows) {
        if (row.gradeCode !== null) {
          row.confirmedAt = new Date()
          row.confirmedByStaffId = staff.actorId
          row.version += 1
        }
      }
      return (await manager.save(rows)).map(toSummaryRow)
    })
  }

  async schoolRows(staff: StaffAccess, tourSessionId: string, organizationId: string): Promise<readonly SchoolEvaluationRow[]> {
    const db = await this.database.getDataSource()
    if (!canReadSchoolEvaluations(staff, organizationId)) throw new ForbiddenException({ code: "evaluation_school_forbidden", message: "school report forbidden" })
    await assertStaffSession(db.manager, staff, tourSessionId)
    const rows = await db.manager.find(StudentEvaluationEntity, { where: { tourSessionId, organizationId }, order: { className: "ASC", displayName: "ASC" } })
    return filterSchoolConfirmedGrades(rows.map(toSummaryRow), organizationId)
  }

  async schoolReport(staff: StaffAccess, tourSessionId: string, organizationId: string, format: "xlsx" | "wordxml"): Promise<{ readonly filename: string; readonly contentType: string; readonly body: Buffer; readonly formatLabel: string }> {
    const rows = await this.schoolRows(staff, tourSessionId, organizationId)
    if (format === "xlsx") {
      return { filename: "school-evaluation-report.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: await createSchoolEvaluationWorkbook(rows), formatLabel: "Excel 基础格式" }
    }
    return { filename: "school-evaluation-report.xml", contentType: "application/msword", body: createSchoolEvaluationWordXml(rows, { title: "研学评价报告", templateNote: "本报告仅列出已确认的评价等级，不含内部观察记录。" }), formatLabel: "Word XML 基础格式" }
  }
}

async function assertStaffSession(manager: EntityManager, access: StaffAccess, tourSessionId: string): Promise<TourSessionEntity> {
  const session = await manager.findOneBy(TourSessionEntity, { id: tourSessionId })
  if (session === null) throw new NotFoundException({ code: "tour_session_not_found", message: "session not found" })
  if (!access.scopes.some((scope) => scope.kind === "all" || ((scope.kind === "organization" || scope.kind === "school") && scope.id === session.organizationId) || (scope.kind === "tour_session" && scope.id === session.id))) {
    throw new ForbiddenException({ code: "evaluation_scope_forbidden", message: "session scope forbidden" })
  }
  return session
}

async function confirmedStandard(manager: EntityManager, id: string, tourSessionId: string): Promise<EvaluationStandardEntity> {
  const standard = await manager.findOneBy(EvaluationStandardEntity, { id, tourSessionId })
  if (standard === null || standard.confirmedAt === null) throw new ConflictException({ code: "evaluation_standard_unconfirmed", message: "confirmed standard is required" })
  assertStandardHasAB(standard.items)
  return standard
}

async function upsertEvaluation(manager: EntityManager, staff: StaffAccess, traveler: TravelerRecord, input: {
  readonly standard: EvaluationStandardEntity | null
  readonly idempotencyKey: string
  readonly internalComment: string
  readonly excellent: boolean
  readonly attention: boolean
  readonly gradeCode: EvaluationGradeCode | null
}): Promise<StudentEvaluationEntity> {
  const existing = await manager.findOne(StudentEvaluationEntity, { where: { tourSessionId: traveler.tourSessionId, personRef: traveler.personRef }, lock: { mode: "pessimistic_write" } })
  const row = existing ?? manager.create(StudentEvaluationEntity, {
    id: makeId("eval"),
    tourSessionId: traveler.tourSessionId,
    organizationId: traveler.organizationId,
    personRef: traveler.personRef,
    displayName: traveler.displayName,
    gradeName: traveler.gradeName,
    className: traveler.className,
  })
  row.standardId = input.standard?.id ?? null
  row.standardVersion = input.standard?.version ?? null
  applyGrade(row, input.standard, input.gradeCode)
  row.internalComment = input.internalComment
  row.excellent = input.excellent
  row.attention = input.attention
  row.idempotencyKey = input.idempotencyKey
  row.updatedByStaffId = staff.actorId
  row.confirmedAt = null
  row.confirmedByStaffId = null
  if (existing !== null) row.version += 1
  return manager.save(row)
}

function applyGrade(row: StudentEvaluationEntity, standard: EvaluationStandardEntity | null, gradeCode: EvaluationGradeCode | null): void {
  if (gradeCode === null) {
    row.gradeCode = null
    row.gradeLabel = null
    return
  }
  if (standard === null) throw new ConflictException({ code: "evaluation_standard_required", message: "confirmed standard is required before A/B grades" })
  const item = standard.items.find((candidate) => candidate.code === gradeCode)
  if (item === undefined) throw new ConflictException({ code: "evaluation_grade_unsupported", message: "grade is not part of the confirmed standard" })
  row.gradeCode = gradeCode
  row.gradeLabel = item.label
}

function assertStandardHasAB(items: readonly StandardItemInput[]): void {
  const codes = new Set(items.map((item) => item.code))
  if (!codes.has("A") || !codes.has("B")) throw new ConflictException({ code: "evaluation_standard_incomplete", message: "standard must include A/B" })
}

function toStandardSummary(row: EvaluationStandardEntity): EvaluationStandardSummary {
  return { id: row.id, tourSessionId: row.tourSessionId, title: row.title, confirmedAt: row.confirmedAt?.toISOString() ?? null, version: row.version, items: row.items }
}

function toSummaryRow(row: StudentEvaluationEntity): EvaluationSummaryRow {
  return {
    id: row.id,
    version: row.version,
    standardId: row.standardId,
    personRef: readStoredPersonRef(row.personRef),
    displayName: row.displayName,
    organizationId: row.organizationId,
    gradeName: row.gradeName,
    className: row.className,
    gradeCode: row.gradeCode,
    gradeLabel: row.gradeLabel,
    internalComment: row.internalComment,
    excellent: row.excellent,
    attention: row.attention,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  }
}

function readStoredPersonRef(value: string): PersonRef {
  if (isStoredPersonRef(value)) return value
  throw new ConflictException({ code: "evaluation_person_ref_invalid", message: "stored evaluation personRef is invalid" })
}

function isStoredPersonRef(value: string): value is PersonRef {
  return /^(paid|imported):[\w-]{1,64}$/.test(value)
}

function stale(): ConflictException {
  return new ConflictException({ code: "evaluation_stale", message: "record has changed, refresh before retrying" })
}
