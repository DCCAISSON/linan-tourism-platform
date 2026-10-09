import { BadRequestException, Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import type { Response } from "express"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { mediaId, parseMediaProvider, parseMediaStatus, parseMediaUpload } from "./media.parser.js"
import { MediaService } from "./media.service.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("staff/media")
export class StaffMediaController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  @Get("sessions")
  async sessions(@Headers() headers: RequestHeaders) {
    return this.media.sessions(await this.staffAccess.resolve(headers))
  }

  @Get("sessions/:sessionId")
  async list(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string) {
    return this.media.list(await this.staffAccess.resolve(headers), mediaId(sessionId))
  }

  @Post("sessions/:sessionId/assets")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @UploadedFile() file: unknown, @Body() body: unknown) {
    return this.media.upload(await this.staffAccess.resolveExecutionWrite(headers), mediaId(sessionId), parseMediaUpload(file, body))
  }

  @Patch("sessions/:sessionId/assets/:assetId/status")
  async status(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("assetId") assetId: string, @Body() body: unknown) {
    return this.media.changeStatus(await this.staffAccess.resolveExecutionWrite(headers), { sessionId: mediaId(sessionId), assetId: mediaId(assetId) }, parseMediaStatus(body))
  }

  @Post("sessions/:sessionId/assets/:assetId/status")
  async nativeStatus(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("assetId") assetId: string, @Body() body: unknown) {
    return this.status(headers, sessionId, assetId, body)
  }

  @Delete("sessions/:sessionId/assets/:assetId")
  async remove(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("assetId") assetId: string, @Query() query: unknown) {
    return this.media.remove(await this.staffAccess.resolveExecutionWrite(headers), { sessionId: mediaId(sessionId), assetId: mediaId(assetId) }, readExpectedVersion(query))
  }

  @Get("sessions/:sessionId/assets/:assetId/content")
  async content(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Param("assetId") assetId: string, @Res() response: Response): Promise<void> {
    const result = await this.media.content(await this.staffAccess.resolve(headers), mediaId(sessionId), mediaId(assetId))
    response.status(200).setHeader("Content-Type", result.asset.contentType).send(result.body)
  }

  @Patch("sessions/:sessionId/providers")
  async provider(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.media.saveProvider(await this.staffAccess.resolve(headers), mediaId(sessionId), parseMediaProvider(body))
  }
}

@Controller("orders")
export class FamilyMediaController {
  constructor(
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  @Get(":orderId/media")
  async list(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string) {
    return this.media.familyList(await this.identity.resolve(headers), mediaId(orderId))
  }

  @Get(":orderId/media/:assetId/content")
  async content(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Param("assetId") assetId: string, @Res() response: Response): Promise<void> {
    const result = await this.media.familyContent(await this.identity.resolve(headers), mediaId(orderId), mediaId(assetId))
    response.status(200).setHeader("Content-Type", result.asset.contentType).send(result.body)
  }
}

function readExpectedVersion(value: unknown): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalidVersion()
  const expectedVersion = Object.fromEntries(Object.entries(value))["expectedVersion"]
  if (typeof expectedVersion !== "string" || !/^\d+$/.test(expectedVersion)) throw invalidVersion()
  const parsed = Number(expectedVersion)
  if (!Number.isSafeInteger(parsed)) throw invalidVersion()
  return parsed
}

function invalidVersion(): BadRequestException {
  return new BadRequestException({ code: "media_input_invalid", message: "版本号不正确" })
}
