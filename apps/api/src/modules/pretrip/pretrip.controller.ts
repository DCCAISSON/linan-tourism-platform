import { Body, Controller, Get, Headers, Inject, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import type { Response } from "express"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { parseAdjustmentProcess, parsePretripAdjustment, parsePretripConfig } from "./pretrip.parser.js"
import { PretripService } from "./pretrip.service.js"
import { parsePretripAttachmentUpload, PRETRIP_ATTACHMENT_MAX_BYTES } from "./pretrip-attachments.parser.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller()
export class PretripController {
  constructor(
    @Inject(PretripService) private readonly pretrip: PretripService,
    @Inject(EnrollmentIdentityService) private readonly identities: EnrollmentIdentityService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  @Get("orders/:orderId/pretrip")
  async family(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string) {
    return this.pretrip.familyPretrip(await this.identities.resolve(headers), orderId)
  }

  @Post("orders/:orderId/pretrip/attachments/:attachmentId/url")
  async attachmentUrl(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Param("attachmentId") attachmentId: string) {
    return this.pretrip.attachmentUrl(await this.identities.resolve(headers), orderId, attachmentId)
  }

  @Get("orders/:orderId/pretrip/attachments/:attachmentId/download")
  async downloadAttachment(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Param("attachmentId") attachmentId: string, @Query("expiresAt") expiresAt: string, @Res() response: Response): Promise<void> {
    const file = await this.pretrip.downloadAttachment(await this.identities.resolve(headers), orderId, attachmentId, expiresAt)
    response.status(200).set({ "Content-Type": file.attachment.contentType, "Content-Length": String(file.body.length), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.attachment.title)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(file.body)
  }

  @Post("pretrip/staff/sessions/:tourSessionId/attachments")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: PRETRIP_ATTACHMENT_MAX_BYTES } }))
  async uploadAttachment(@Headers() headers: StaffAccessRequestHeaders, @Param("tourSessionId") tourSessionId: string, @UploadedFile() file: unknown, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.pretrip.uploadAttachment(await this.staffAccess.resolve(headers), tourSessionId, parsePretripAttachmentUpload(file, body))
  }

  @Get("pretrip/staff/sessions/:tourSessionId")
  async staffConfig(@Headers() headers: StaffAccessRequestHeaders, @Param("tourSessionId") tourSessionId: string) {
    return this.pretrip.readStaffConfig(await this.staffAccess.resolve(headers), tourSessionId)
  }

  @Put("pretrip/staff/sessions/:tourSessionId")
  async saveStaffConfig(@Headers() headers: StaffAccessRequestHeaders, @Param("tourSessionId") tourSessionId: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.pretrip.saveStaffConfig(await this.staffAccess.resolve(headers), tourSessionId, parsePretripConfig(body))
  }

  @Get("pretrip/staff/sessions/:tourSessionId/school-confirmations")
  async schoolConfirmations(@Headers() headers: StaffAccessRequestHeaders, @Param("tourSessionId") tourSessionId: string) {
    return this.pretrip.schoolConfirmations(await this.staffAccess.resolve(headers), tourSessionId)
  }

  @Post("pretrip/school/sessions/:tourSessionId/confirmations")
  async schoolConfirm(@Headers() headers: StaffAccessRequestHeaders, @Param("tourSessionId") tourSessionId: string) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.pretrip.schoolConfirm(await this.staffAccess.resolve(headers), tourSessionId)
  }

  @Post("pretrip/school/sessions/:tourSessionId/adjustments")
  async schoolAdjust(@Headers() headers: StaffAccessRequestHeaders, @Param("tourSessionId") tourSessionId: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.pretrip.schoolAdjust(await this.staffAccess.resolve(headers), tourSessionId, parsePretripAdjustment(body))
  }

  @Post("pretrip/staff/adjustments/:requestId/process")
  async process(@Headers() headers: StaffAccessRequestHeaders, @Param("requestId") requestId: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.pretrip.processAdjustment(await this.staffAccess.resolve(headers), requestId, parseAdjustmentProcess(body))
  }
}
