import { Body, Controller, Get, Headers, Inject, Param, Post, Put, Query } from "@nestjs/common"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import type { StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { BusinessService } from "./business.service.js"
import { BusinessInquiryService } from "./business-inquiry.service.js"
import { businessInputError, parseCategory, parseFollowup, parseInquiry, parseProduct, parseVersion } from "./business.parser.js"

@Controller("business")
export class BusinessController {
  constructor(
    @Inject(BusinessService) private readonly business: BusinessService,
    @Inject(BusinessInquiryService) private readonly inquiries: BusinessInquiryService,
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
  ) {}
  @Get("products")
  list(@Query("category") category: unknown) { return this.business.listPublic(parseCategory(category)) }
  @Get("products/:id")
  detail(@Param("id") id: string) { return this.business.getPublic(id) }
  @Post("products/:id/inquiries")
  submit(@Param("id") id: string, @Body() body: unknown) { return this.business.submitInquiry(id, parseInquiry(body)) }
  @Get("staff/products")
  async staffList(@Headers() headers: StaffAccessRequestHeaders) { return this.business.listStaff(await this.access.resolve(headers)) }
  @Post("staff/products")
  async create(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.business.create(await this.access.resolve(headers), parseProduct(body))
  }
  @Put("staff/products/:id")
  async update(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    if (typeof body !== "object" || body === null || !("expectedVersion" in body)) throw businessInputError("需要当前版本")
    return this.business.update(await this.access.resolve(headers), id, parseProduct(body), parseVersion(body.expectedVersion))
  }
  @Get("staff/inquiries")
  async staffInquiries(@Headers() headers: StaffAccessRequestHeaders) { return this.inquiries.list(await this.access.resolve(headers)) }
  @Get("staff/inquiries/:id")
  async staffInquiry(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string) { return this.inquiries.detail(await this.access.resolve(headers), id) }
  @Post("staff/inquiries/:id/followups")
  async followup(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.inquiries.followup(await this.access.resolve(headers), id, parseFollowup(body))
  }
}
