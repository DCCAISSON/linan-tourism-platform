import { Body, Catch, Controller, Get, Headers, Inject, Param, PayloadTooLargeException, Post, Res, UploadedFile, UseFilters, UseInterceptors } from "@nestjs/common"
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import type { Response } from "express"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { CATALOG_COVER_MAX_BYTES, parseCatalogCoverFilename, parseCatalogCoverUpload } from "./catalog-cover.parser.js"
import { CatalogCoverService } from "./catalog-cover.service.js"

@Catch(PayloadTooLargeException)
class CatalogCoverUploadSizeFilter implements ExceptionFilter<PayloadTooLargeException> {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(413).json({ code: "catalog_cover_too_large", message: "封面图片不能超过5MB" })
  }
}

@Controller()
export class CatalogCoverController {
  constructor(
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
    @Inject(CatalogCoverService) private readonly covers: CatalogCoverService,
  ) {}

  @Post("configuration/catalog-covers")
  @UseFilters(CatalogCoverUploadSizeFilter)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: CATALOG_COVER_MAX_BYTES, files: 1 } }))
  async upload(@Headers() headers: StaffAccessRequestHeaders, @UploadedFile() file: unknown, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    this.access.assertConfigurationWrite(await this.access.resolve(headers))
    return this.covers.upload(parseCatalogCoverUpload(file, body))
  }

  @Get("catalog-covers/:filename")
  async content(@Param("filename") filename: string, @Res() response: Response): Promise<void> {
    const file = parseCatalogCoverFilename(filename)
    const body = await this.covers.content(file)
    response.status(200)
      .setHeader("Content-Type", file.contentType)
      .setHeader("X-Content-Type-Options", "nosniff")
      .setHeader("Cache-Control", "public, max-age=31536000, immutable")
      .send(body)
  }
}
