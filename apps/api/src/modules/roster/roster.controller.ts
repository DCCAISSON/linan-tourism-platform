import { Controller, Get, Headers, Inject, Query, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { parseRosterFilters } from "./roster.parser.js"
import { RosterService } from "./roster.service.js"
import type { PaymentSummary, RosterSummary } from "./roster.types.js"
import { createRosterWorkbook } from "./roster.workbook.js"
import { WorkbenchService } from "./workbench.service.js"
import type { WorkbenchSummary } from "./workbench.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("roster")
export class RosterController {
  constructor(
    @Inject(RosterService) private readonly roster: RosterService,
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

  @Get("export.xlsx")
  async export(@Headers() headers: RequestHeaders, @Query() query: unknown, @Res() response: Response): Promise<void> {
    const access = await this.staffAccess.resolve(headers)
    const rows = await this.roster.listExportRows(access, parseRosterFilters(query))
    const workbook = await createRosterWorkbook(rows)
    response
      .status(200)
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", "attachment; filename=\"roster.xlsx\"")
      .send(workbook)
  }
}
