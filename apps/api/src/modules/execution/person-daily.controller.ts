import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { parsePersonDailyApproval, parsePersonDailyInput, parsePersonRef } from "./execution.parser.js"
import { PersonDailyService } from "./person-daily.service.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("staff/execution/sessions/:sessionId")
export class PersonDailyController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staff: DevStaffAccessService,
    @Inject(PersonDailyService) private readonly daily: PersonDailyService,
  ) {}

  @Get("person-daily-reports")
  async list(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string) {
    return this.daily.list(await this.staff.resolve(headers), sessionId)
  }

  @Post("people/:personRef/daily-reports")
  async save(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("personRef") personRef: string, @Body() body: unknown) {
    return this.daily.save(await this.staff.resolveExecutionWrite(headers), { sessionId, personRef: parsePersonRef(personRef) }, parsePersonDailyInput(body))
  }

  @Get("person-daily-reports/:reportId/history")
  async history(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("reportId") reportId: string) {
    return this.daily.history(await this.staff.resolve(headers), { sessionId, reportId })
  }

  @Post("person-daily-reports/:reportId/public-summary")
  async approve(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("reportId") reportId: string, @Body() body: unknown) {
    return this.daily.approve(await this.staff.resolveExecutionWrite(headers), { sessionId, reportId }, parsePersonDailyApproval(body))
  }
}
