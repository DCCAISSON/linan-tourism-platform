import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Put } from "@nestjs/common"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { parseCatalogTemplate, parseTemplateLink, parseTemplateSchool, parseTemplateVersion } from "./catalog-template.parser.js"
import { CatalogTemplateService } from "./catalog-template.service.js"

@Controller()
export class CatalogTemplateController {
  constructor(
    @Inject(CatalogTemplateService) private readonly templates: CatalogTemplateService,
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
  ) {}

  @Get("catalog-templates")
  async list(@Headers() headers: StaffAccessRequestHeaders) {
    this.access.assertConfigurationWrite(await this.access.resolve(headers))
    return this.templates.list()
  }

  @Post("catalog-templates")
  async create(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    await this.assertWrite(headers)
    return this.templates.create(parseCatalogTemplate(body))
  }

  @Patch("catalog-templates/:id")
  async update(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    await this.assertWrite(headers)
    return this.templates.update(id, parseCatalogTemplate(body), parseTemplateVersion(body))
  }

  @Post("catalog-templates/:id/schools")
  async addSchool(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    await this.assertWrite(headers)
    return this.templates.addSchool(id, parseTemplateSchool(body))
  }

  @Put("catalog-items/:id/template")
  async link(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    await this.assertWrite(headers)
    return this.templates.link(id, parseTemplateLink(body))
  }

  private async assertWrite(headers: StaffAccessRequestHeaders): Promise<void> {
    this.access.assertUnsafeOrigin(headers)
    this.access.assertConfigurationWrite(await this.access.resolve(headers))
  }
}
