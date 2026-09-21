import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { parseRosterFilters } from "./roster.parser.js"
import { RosterService } from "./roster.service.js"
import { malformedRosterInput } from "./roster.errors.js"
import { RosterImportService } from "./roster-import.service.js"
import type { RosterImportBatchResponse, RosterImportErrorRow, RosterImportScopeInput, RosterImportTemplate } from "./roster-import.types.js"
import type { PaymentSummary, RosterSummary } from "./roster.types.js"
import { createRosterWorkbook } from "./roster.workbook.js"
import { WorkbenchService } from "./workbench.service.js"
import type { WorkbenchSummary } from "./workbench.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("roster")
export class RosterController {
  constructor(
    @Inject(RosterService) private readonly roster: RosterService,
    @Inject(RosterImportService) private readonly rosterImport: RosterImportService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(WorkbenchService) private readonly workbench: WorkbenchService,
  ) {}

  @Get("workbench")
  async workbenchSummary(@Headers() headers: RequestHeaders): Promise<WorkbenchSummary> {
    return this.workbench.summarize(await this.staffAccess.resolve(headers))
  }

  @Get("summary")
  async summary(@Headers() headers: RequestHeaders, @Query() query: unknown): Promise<RosterSummary> {
    return this.roster.summarize(await this.staffAccess.resolve(headers), parseRosterFilters(query))
  }

  @Get("payment-summary")
  async paymentSummary(@Headers() headers: RequestHeaders, @Query() query: unknown): Promise<PaymentSummary> {
    return this.roster.paymentSummary(await this.staffAccess.resolve(headers), parseRosterFilters(query))
  }

  @Post("imports")
  @UseInterceptors(FileInterceptor("file"))
  async importRoster(
    @Headers() headers: RequestHeaders,
    @Body() body: unknown,
    @UploadedFile() file: UploadedRosterFile | undefined,
  ): Promise<RosterImportBatchResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    if (file === undefined || !Buffer.isBuffer(file.buffer)) {
      throw malformedRosterInput("file is required")
    }
    const scope = parseRosterImportBody(body)
    return this.rosterImport.importWorkbook(await this.staffAccess.resolve(headers), {
      ...scope,
      fileName: file.originalname ?? "roster-import.xlsx",
      buffer: file.buffer,
    })
  }

  @Get("imports/:batchId/errors.csv")
  async importErrors(
    @Headers() headers: RequestHeaders,
    @Param("batchId") batchId: string,
    @Res() response: Response,
  ): Promise<void> {
    const errors = await this.rosterImport.listErrors(await this.staffAccess.resolve(headers), batchId)
    response
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", "attachment; filename=\"roster-import-errors.csv\"")
      .send(createErrorCsv(errors))
  }

  @Get("export.xlsx")
  async export(@Headers() headers: RequestHeaders, @Query() query: unknown, @Res() response: Response): Promise<void> {
    const access = await this.staffAccess.resolve(headers)
    const filters = parseRosterFilters(query)
    const rows = await this.roster.listExportRows(access, filters)
    const workbook = await createRosterWorkbook(rows, { includeSensitive: filters.includeSensitive })
    response
      .status(200)
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", "attachment; filename=\"roster.xlsx\"")
      .send(workbook)
  }
}


type UploadedRosterFile = {
  readonly originalname?: string
  readonly buffer: Buffer
}

function parseRosterImportBody(body: unknown): RosterImportScopeInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw malformedRosterInput("body must be an object")
  }
  const record = body as Record<string, unknown>
  const template = readTemplate(record["template"])
  const gradeId = readOptionalImportString(record["gradeId"], "gradeId")
  const classId = readOptionalImportString(record["classId"], "classId")
  return {
    template,
    tourSessionId: readRequiredImportString(record["tourSessionId"], "tourSessionId"),
    schoolId: readRequiredImportString(record["schoolId"], "schoolId"),
    gradeId,
    classId,
  }
}

function readTemplate(value: unknown): RosterImportTemplate {
  if (value === "parent_child" || value === "grade_3_6" || value === "teacher") {
    return value
  }
  throw malformedRosterInput("template must be parent_child, grade_3_6 or teacher")
}

function readRequiredImportString(value: unknown, field: string): string {
  const parsed = readOptionalImportString(value, field)
  if (parsed === null) {
    throw malformedRosterInput(`${field} must be a non-empty string of at most 64 characters`)
  }
  return parsed
}

function readOptionalImportString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 64) {
    throw malformedRosterInput(`${field} must be a non-empty string of at most 64 characters`)
  }
  return value.trim()
}

function createErrorCsv(errors: readonly RosterImportErrorRow[]): string {
  const lines = [["rowNumber", "role", "field", "message"], ...errors.map((error) => [
    String(error.rowNumber),
    error.role ?? "",
    error.field,
    error.message,
  ])]
  return lines.map((row) => row.map(csvCell).join(",")).join("\r\n")
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}
