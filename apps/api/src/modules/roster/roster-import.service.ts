import { randomUUID } from "node:crypto"
import { BadRequestException, Inject, Injectable } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import {  OrganizationEntity,
  RosterImportBatchEntity,
  RosterImportErrorEntity,
  RosterImportPersonEntity,
  SchoolClassEntity,
  SchoolGradeEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { protectPersonData } from "../enrollment/person-data.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { malformedRosterInput, rosterSessionNotFound } from "./roster.errors.js"
import { parseRosterImportWorkbook } from "./roster-import.parser.js"
import type {
  ParsedRosterImportRow,
  ParsedRosterPerson,
  RosterImportBatchResponse,
  RosterImportErrorRow,
  RosterImportRequest,
  RosterImportRole,
  RosterImportScopeInput,
} from "./roster-import.types.js"

@Injectable()
export class RosterImportService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async importWorkbook(access: StaffAccess, input: RosterImportRequest): Promise<RosterImportBatchResponse> {
    const rows = await parseRosterImportWorkbook(input.buffer, input.template)
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const scope = await this.validateScope(manager, input)
      this.staffAccess.assertRosterImportScope(access, {
        schoolId: scope.session.organizationId,
        requestedSchoolId: input.schoolId,
        requestedClassId: input.classId,
        tourSessionId: scope.session.id,
      })

      const batch = manager.create(RosterImportBatchEntity, {
        id: makeRosterImportId("rib"),
        organizationId: input.schoolId,
        tourSessionId: input.tourSessionId,
        gradeId: input.gradeId,
        classId: input.classId,
        sourceTemplate: input.template,
        fileName: input.fileName.slice(0, 255),
        createdBy: access.actorId,
        totalRows: rows.length,
      })
      await manager.save(batch)

      const counters = { imported: 0, duplicate: 0 }
      const errors: RosterImportErrorRow[] = []
      for (const row of rows) {
        await this.importRow(manager, access, batch.id, input, row, errors, counters)
      }

      batch.importedCount = counters.imported
      batch.duplicateCount = counters.duplicate
      batch.errorCount = errors.length
      await manager.save(batch)
      if (errors.length > 0) {
        await manager.save(errors.map((error) => manager.create(RosterImportErrorEntity, {
          id: makeRosterImportId("rie"),
          batchId: batch.id,
          sourceRowNumber: error.rowNumber,
          role: error.role,
          field: error.field,
          message: error.message,
        })))
      }
      await this.audit.record(manager, {
        organizationId: input.schoolId,
        actorId: access.actorId,
        action: "roster.imported",
        targetType: "roster_import_batch",
        targetId: batch.id,
      })
      return toBatchResponse(batch, input, errors)
    })
  }

  async listErrors(access: StaffAccess, batchId: string): Promise<readonly RosterImportErrorRow[]> {
    const manager = (await this.database.getDataSource()).manager
    const batch = await manager.findOneBy(RosterImportBatchEntity, { id: batchId })
    if (batch === null) {
      throw new BadRequestException({ code: "not_found", message: "import batch was not found" })
    }
    this.staffAccess.assertRosterImportScope(access, {
      schoolId: batch.organizationId,
      requestedSchoolId: batch.organizationId,
      requestedClassId: batch.classId,
      tourSessionId: batch.tourSessionId,
    })
    const errors = await manager.findBy(RosterImportErrorEntity, { batchId })
    return errors.map((error) => ({ rowNumber: error.sourceRowNumber, role: error.role, field: error.field, message: error.message }))
  }

  private async validateScope(manager: EntityManager, input: RosterImportScopeInput): Promise<{ readonly session: TourSessionEntity }> {
    const session = await manager.findOne(TourSessionEntity, {
      where: { id: input.tourSessionId }, lock: { mode: "pessimistic_write" },
    })
    if (session === null) {
      throw rosterSessionNotFound()
    }
    const school = await manager.findOneBy(OrganizationEntity, { id: input.schoolId })
    if (school === null || school.id !== session.organizationId) {
      throw malformedRosterInput("schoolId must match the selected tour session")
    }
    if (input.template !== "teacher" && (input.gradeId === null || input.classId === null)) {
      throw malformedRosterInput("student imports require gradeId and classId")
    }
    if (input.gradeId !== null) {
      const grade = await manager.findOneBy(SchoolGradeEntity, { id: input.gradeId })
      if (grade === null || grade.organizationId !== input.schoolId) {
        throw malformedRosterInput("gradeId must belong to the selected school")
      }
    }
    if (input.classId !== null) {
      const schoolClass = await manager.findOneBy(SchoolClassEntity, { id: input.classId })
      if (schoolClass === null || schoolClass.gradeId !== input.gradeId) {
        throw malformedRosterInput("classId must belong to the selected grade")
      }
    }
    return { session }
  }

  private async importRow(
    manager: EntityManager,
    access: StaffAccess,
    batchId: string,
    input: RosterImportRequest,
    row: ParsedRosterImportRow,
    errors: RosterImportErrorRow[],
    counters: { imported: number; duplicate: number },
  ): Promise<void> {
    if (row.className.length === 0) {
      errors.push(rowError(row, null, "className", "班级不能为空"))
    }
    for (const person of row.people) {
      await this.importPerson(manager, access, batchId, input, row, person, errors, counters)
    }
  }

  private async importPerson(
    manager: EntityManager,
    access: StaffAccess,
    batchId: string,
    input: RosterImportRequest,
    row: ParsedRosterImportRow,
    person: ParsedRosterPerson,
    errors: RosterImportErrorRow[],
    counters: { imported: number; duplicate: number },
  ): Promise<void> {
    const missing = requiredPersonFields(person)
    if (missing.length > 0) {
      for (const field of missing) {
        errors.push(rowError(row, person.role, field, "必填项不能为空"))
      }
      return
    }

    try {
      const protectedData = protectPersonData({ identityNumber: person.identityNumber, phone: person.phone })
      if (row.className.length === 0) return
      const existing = await manager.findOneBy(RosterImportPersonEntity, {
        tourSessionId: input.tourSessionId,
        identityHash: protectedData.identityHash,
      })
      if (existing !== null) {
        if (
          existing.organizationId === input.schoolId
          && existing.gradeId === input.gradeId
          && existing.classId === input.classId
          && existing.sourceClassName === row.className.slice(0, 120)
          && existing.role === person.role
          && existing.displayName === person.displayName.slice(0, 120)
          && existing.phoneHash === protectedData.phoneHash
        ) {
          counters.duplicate += 1
        } else {
          errors.push(rowError(row, person.role, "identityNumber", "证件号码已在同团期导入，但姓名、角色、班级或手机号不一致"))
        }
        return
      }
      await manager.save(manager.create(RosterImportPersonEntity, {
        id: makeRosterImportId("rip"),
        batchId,
        organizationId: input.schoolId,
        tourSessionId: input.tourSessionId,
        gradeId: input.gradeId,
        classId: input.classId,
        sourceRowNumber: row.rowNumber,
        sourceClassName: row.className.slice(0, 120),
        role: person.role,
        displayName: person.displayName.slice(0, 120),
        identityCiphertext: protectedData.identityCiphertext,
        identityHash: protectedData.identityHash,
        identityMasked: protectedData.identityMasked,
        phoneCiphertext: protectedData.phoneCiphertext,
        phoneHash: protectedData.phoneHash,
        phoneMasked: protectedData.phoneMasked,
        personDataKeyVersion: protectedData.keyVersion,
        createdBy: access.actorId,
      }))
      counters.imported += 1
    } catch (error) {
      errors.push(rowError(row, person.role, errorField(error), errorMessage(error)))
    }
  }
}

function requiredPersonFields(person: ParsedRosterPerson): string[] {
  const missing: string[] = []
  if (person.displayName.length === 0) missing.push("displayName")
  if (person.identityNumber.length === 0) missing.push("identityNumber")
  if (person.phone.length === 0) missing.push("phone")
  return missing
}

function rowError(row: ParsedRosterImportRow, role: RosterImportRole | null, field: string, message: string): RosterImportErrorRow {
  return { rowNumber: row.rowNumber, role, field, message }
}

function errorField(error: unknown): string {
  const message = errorMessage(error)
  return message.includes("identityNumber") ? "identityNumber" : message.includes("phone") ? "phone" : "row"
}

function errorMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    const response = error.getResponse()
    if (typeof response === "object" && response !== null && "message" in response && typeof response.message === "string") {
      return response.message
    }
  }
  if (error instanceof Error) {
    return error.message
  }
  return "导入失败"
}

function makeRosterImportId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

function toBatchResponse(batch: RosterImportBatchEntity, input: RosterImportRequest, errors: readonly RosterImportErrorRow[]): RosterImportBatchResponse {
  return {
    id: batch.id,
    sourceTemplate: input.template,
    tourSessionId: batch.tourSessionId,
    schoolId: batch.organizationId,
    gradeId: batch.gradeId,
    classId: batch.classId,
    fileName: batch.fileName,
    totalRows: batch.totalRows,
    importedCount: batch.importedCount,
    duplicateCount: batch.duplicateCount,
    errorCount: batch.errorCount,
    errors,
  }
}
