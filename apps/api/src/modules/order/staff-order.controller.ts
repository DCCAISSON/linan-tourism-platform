import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { parseRefundSelection, parseRefundSimulation } from "./local-refund.parser.js"
import { LocalRefundService, type LocalRefundPreview } from "./local-refund.service.js"
import { parseOrderId } from "./order.parser.js"
import { parseStaffRefundRequest, parseStaffRefundResult } from "./refund-request.parser.js"
import { StaffRefundService } from "./staff-refund.service.js"
import { parseStaffOrderFilters, StaffOrderService } from "./staff-order.service.js"
import type { OrderDetailResponse, StaffOrderListResponse, StaffRefundResponse } from "./order.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("staff/orders")
export class StaffOrderController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(StaffOrderService) private readonly orders: StaffOrderService,
    @Inject(LocalRefundService) private readonly refunds: LocalRefundService,
    @Inject(StaffRefundService) private readonly staffRefunds: StaffRefundService,
  ) {}

  @Get()
  async list(@Headers() headers: RequestHeaders, @Query() query: unknown): Promise<StaffOrderListResponse> {
    this.staffAccess.assertOrderReadScope(await this.staffAccess.resolve(headers))
    return this.orders.list(parseStaffOrderFilters(query))
  }

  @Get(":id")
  async detail(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<OrderDetailResponse> {
    this.staffAccess.assertOrderReadScope(await this.staffAccess.resolve(headers))
    return this.orders.detail(parseOrderId(id))
  }

  @Post(":id/refund-preview")
  async preview(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<LocalRefundPreview> {
    this.staffAccess.assertUnsafeOrigin(headers)
    this.staffAccess.assertRefundPreviewScope(await this.staffAccess.resolve(headers))
    return this.refunds.previewStaff(parseOrderId(id), parseRefundSelection(body))
  }

  @Post(":id/refund-simulation")
  async simulate(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<LocalRefundPreview & { readonly outcome: "succeeded" | "failed" }> {
    this.staffAccess.assertUnsafeOrigin(headers)
    this.staffAccess.assertRefundSimulationScope(await this.staffAccess.resolve(headers))
    const input = parseRefundSimulation(body)
    return { ...await this.refunds.previewStaff(parseOrderId(id), input), outcome: input.outcome }
  }

  @Post(":id/refunds")
  async createRefund(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<StaffRefundResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    const access = await this.staffAccess.resolve(headers)
    this.staffAccess.assertRefundManageScope(access)
    return this.staffRefunds.create(parseOrderId(id), parseStaffRefundRequest(body), access.actorId)
  }

  @Post(":id/refunds/:refundId/local-result")
  async processRefund(@Headers() headers: RequestHeaders, @Param("id") id: string, @Param("refundId") refundId: string, @Body() body: unknown): Promise<StaffRefundResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    const access = await this.staffAccess.resolve(headers)
    this.staffAccess.assertRefundManageScope(access)
    return this.staffRefunds.processLocalResult(parseOrderId(id), parseOrderId(refundId), parseStaffRefundResult(body), access.actorId)
  }
}
