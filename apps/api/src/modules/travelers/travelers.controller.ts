import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { parseImportChange, parseImportCorrection, parsePersonRef, parseTravelerQuery } from "./travelers.parser.js"
import { TravelersService, type TravelerListResponse } from "./travelers.service.js"
import type { TravelerDto } from "./travelers.types.js"
import { createTravelersWorkbook } from "./travelers.workbook.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("travelers")
export class TravelersController {
  constructor(
    @Inject(TravelersService) private readonly travelers: TravelersService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  @Get("sessions/:tourSessionId")
  async list(@Headers() headers: RequestHeaders, @Param("tourSessionId") tourSessionId: string, @Query() query: unknown): Promise<TravelerListResponse> {
    return this.travelers.list(await this.staffAccess.resolve(headers), tourSessionId, parseTravelerQuery(query))
  }

  @Get("sessions/:tourSessionId/people/:personRef")
  async detail(@Headers() headers: RequestHeaders, @Param("tourSessionId") tourSessionId: string, @Param("personRef") personRef: string): Promise<TravelerDto> {
    return this.travelers.detail(await this.staffAccess.resolve(headers), tourSessionId, parsePersonRef(decodeURIComponent(personRef)))
  }

  @Get("sessions/:tourSessionId/export.xlsx")
  async export(@Headers() headers: RequestHeaders, @Param("tourSessionId") tourSessionId: string, @Query() query: unknown, @Res() response: Response): Promise<void> {
    const rows = await this.travelers.exportRows(await this.staffAccess.resolve(headers), tourSessionId, parseTravelerQuery(query))
    const workbook = await createTravelersWorkbook(rows)
    response
      .status(200)
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", 'attachment; filename="travelers.xlsx"')
      .send(workbook)
  }

  @Post("imports/:importPersonId/confirm")
  async confirmImport(@Headers() headers: RequestHeaders, @Param("importPersonId") importPersonId: string, @Body() body: unknown): Promise<TravelerListResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.travelers.confirmImport(await this.staffAccess.resolve(headers), importPersonId, parseImportChange(body))
  }

  @Post("imports/:importPersonId/disable")
  async disableImport(@Headers() headers: RequestHeaders, @Param("importPersonId") importPersonId: string, @Body() body: unknown): Promise<TravelerListResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.travelers.disableImport(await this.staffAccess.resolve(headers), importPersonId, parseImportChange(body))
  }

  @Post("imports/:importPersonId/corrections")
  async correctImport(@Headers() headers: RequestHeaders, @Param("importPersonId") importPersonId: string, @Body() body: unknown): Promise<TravelerListResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.travelers.correctImport(await this.staffAccess.resolve(headers), importPersonId, parseImportCorrection(body))
  }
}
