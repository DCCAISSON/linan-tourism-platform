import { Body, Controller, Get, Headers, Inject, Param, Post, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { parseArchiveSections } from "./session-archives.policy.js"
import { SessionArchivesService } from "./session-archives.service.js"

@Controller("staff/session-archives")
export class SessionArchivesController {
  constructor(@Inject(DevStaffAccessService) private readonly staff: DevStaffAccessService, @Inject(SessionArchivesService) private readonly archives: SessionArchivesService) {}
  @Get("sessions")
  async sessions(@Headers() headers: StaffAccessRequestHeaders) { return this.archives.sessions(await this.staff.resolve(headers)) }
  @Get("sessions/:sessionId/archives")
  async list(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string) { return this.archives.list(await this.staff.resolve(headers), sessionId) }
  @Post("sessions/:sessionId/archives")
  async create(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    this.staff.assertUnsafeOrigin(headers)
    return this.archives.create(await this.staff.resolve(headers), sessionId, parseArchiveSections(body))
  }
  @Get("sessions/:sessionId/archives/:archiveId")
  async detail(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Param("archiveId") archiveId: string) { return this.archives.detail(await this.staff.resolve(headers), sessionId, archiveId) }
  @Get("sessions/:sessionId/archives/:archiveId/download.xlsx")
  async download(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Param("archiveId") archiveId: string, @Res() response: Response): Promise<void> {
    const bytes = await this.archives.download(await this.staff.resolve(headers), sessionId, archiveId)
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response.setHeader("Content-Disposition", 'attachment; filename="session-archive.xlsx"')
    response.send(bytes)
  }
}
