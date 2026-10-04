import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { parseOrderId } from "../order/order.parser.js"
import { parseApplicationInput, parseExecuteInput, parseReviewInput } from "./refund-application.policy.js"
import { RefundApplicationService } from "./refund-application.service.js"
import type { RefundApplicationResponse } from "./refund-application.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller()
export class FamilyRefundApplicationController {
  constructor(
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
    @Inject(RefundApplicationService) private readonly applications: RefundApplicationService,
  ) {}

  @Post("orders/:id/refund-applications")
  async submit(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<RefundApplicationResponse> {
    const identity = await this.identity.resolve(headers)
    return this.applications.submit(identity, parseOrderId(id), parseApplicationInput(body))
  }

  @Get("orders/:id/refund-applications")
  async list(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<readonly RefundApplicationResponse[]> {
    const identity = await this.identity.resolve(headers)
    return this.applications.listFamily(identity, parseOrderId(id))
  }

  @Post("orders/:id/refund-applications/:applicationId/cancel")
  async cancel(@Headers() headers: RequestHeaders, @Param("id") id: string, @Param("applicationId") applicationId: string): Promise<RefundApplicationResponse> {
    const identity = await this.identity.resolve(headers)
    return this.applications.withdraw(identity, parseOrderId(id), parseOrderId(applicationId))
  }
}

@Controller("staff/refund-applications")
export class StaffRefundApplicationController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(RefundApplicationService) private readonly applications: RefundApplicationService,
  ) {}

  @Get()
  async list(@Headers() headers: RequestHeaders, @Query("status") status?: string): Promise<readonly RefundApplicationResponse[]> {
    return this.applications.listStaff(await this.staffAccess.resolve(headers), status)
  }

  @Post(":id/review")
  async review(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<RefundApplicationResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.applications.review(await this.staffAccess.resolve(headers), parseOrderId(id), parseReviewInput(body))
  }

  @Post(":id/execute")
  async execute(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<RefundApplicationResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.applications.execute(await this.staffAccess.resolve(headers), parseOrderId(id), parseExecuteInput(body))
  }
}
