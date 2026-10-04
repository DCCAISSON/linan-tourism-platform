import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { parseOrderId } from "../order/order.parser.js"
import { parseChangeNote, parseChangeStatus, parseChangeVersion, parseReviewOrderChange, parseSubmitOrderChange, parseSupplementOrderChange } from "./order-change.parser.js"
import { OrderChangeService } from "./order-change.service.js"
import type { OrderChangeList, OrderChangeResponse } from "./order-change.types.js"

@Controller("orders/:orderId/change-requests")
export class FamilyOrderChangeController {
  constructor(@Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService, @Inject(OrderChangeService) private readonly changes: OrderChangeService) {}

  @Get()
  async list(@Headers() headers: StaffAccessRequestHeaders, @Param("orderId") orderId: string): Promise<OrderChangeList> {
    return this.changes.listFamily(await this.identity.resolve(headers), parseOrderId(orderId))
  }

  @Post()
  async submit(@Headers() headers: StaffAccessRequestHeaders, @Param("orderId") orderId: string, @Body() body: unknown): Promise<OrderChangeResponse> {
    return this.changes.submit(await this.identity.resolve(headers), parseOrderId(orderId), parseSubmitOrderChange(body))
  }

  @Post(":id/supplement")
  async supplement(@Headers() headers: StaffAccessRequestHeaders, @Param("orderId") orderId: string, @Param("id") id: string, @Body() body: unknown): Promise<OrderChangeResponse> {
    return this.changes.supplement(await this.identity.resolve(headers), parseOrderId(orderId), parseOrderId(id), parseSupplementOrderChange(body))
  }

  @Post(":id/withdraw")
  async withdraw(@Headers() headers: StaffAccessRequestHeaders, @Param("orderId") orderId: string, @Param("id") id: string, @Body() body: unknown): Promise<OrderChangeResponse> {
    return this.changes.withdraw(await this.identity.resolve(headers), parseOrderId(orderId), parseOrderId(id), parseChangeVersion(body))
  }
}

@Controller("staff/order-changes")
export class StaffOrderChangeController {
  constructor(@Inject(DevStaffAccessService) private readonly access: DevStaffAccessService, @Inject(OrderChangeService) private readonly changes: OrderChangeService) {}

  @Get()
  async list(@Headers() headers: StaffAccessRequestHeaders, @Query("status") status?: string): Promise<readonly OrderChangeResponse[]> {
    return this.changes.listStaff(await this.access.resolve(headers), parseChangeStatus(status))
  }

  @Post(":id/review")
  async review(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<OrderChangeResponse> {
    this.access.assertUnsafeOrigin(headers)
    return this.changes.review(await this.access.resolve(headers), parseOrderId(id), parseReviewOrderChange(body))
  }

  @Post(":id/notes")
  async addNote(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<OrderChangeResponse> {
    this.access.assertUnsafeOrigin(headers)
    return this.changes.addNote(await this.access.resolve(headers), parseOrderId(id), parseChangeNote(body))
  }
}
