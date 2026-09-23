import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, Res } from "@nestjs/common"
import type { Response } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { crmId, parseCrmContact, parseCrmCustomer, parseCrmFilters, parseCrmFollowup, parseCrmUpdate } from "./crm.parser.js"
import { CrmReadService } from "./crm-read.service.js"
import { CrmService } from "./crm.service.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("staff/crm")
export class CrmController {
  constructor(
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(CrmReadService) private readonly crmRead: CrmReadService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  @Get("organizations")
  async organizations(@Headers() headers: RequestHeaders) {
    return this.crmRead.organizations(await this.staffAccess.resolve(headers))
  }

  @Get("options")
  async options(@Headers() headers: RequestHeaders, @Query("organizationId") organizationId: unknown) {
    return this.crmRead.options(await this.staffAccess.resolve(headers), crmId(organizationId))
  }

  @Get("contacts")
  async contacts(@Headers() headers: RequestHeaders, @Query() query: unknown) {
    return this.crmRead.list(await this.staffAccess.resolve(headers), parseCrmFilters(query))
  }

  @Post("contacts")
  async create(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.crm.create(await this.staffAccess.resolve(headers), parseCrmCustomer(body))
  }

  @Get("contacts/:id")
  async detail(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    return this.crmRead.detail(await this.staffAccess.resolve(headers), crmId(id))
  }

  @Patch("contacts/:id")
  async update(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.crm.update(await this.staffAccess.resolve(headers), crmId(id), parseCrmUpdate(body))
  }

  @Post("contacts/:id/followups")
  async followup(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.crm.followup(await this.staffAccess.resolve(headers), crmId(id), parseCrmFollowup(body))
  }

  @Get("contacts/:id/history")
  async history(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    return this.crmRead.history(await this.staffAccess.resolve(headers), crmId(id))
  }

  @Get("contacts/:id/contact")
  async contact(@Headers() headers: RequestHeaders, @Param("id") id: string, @Query() query: unknown) {
    parseCrmContact(query)
    return this.crm.contact(await this.staffAccess.resolve(headers), crmId(id))
  }

  @Get("export.csv")
  async export(@Headers() headers: RequestHeaders, @Query() query: unknown, @Res() response: Response): Promise<void> {
    const csv = await this.crmRead.export(await this.staffAccess.resolve(headers), parseCrmFilters(query))
    response
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", "attachment; filename=\"crm-customers.csv\"")
      .send(csv)
  }
}
