import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { parseRefundSelection, parseRefundSimulation } from "./local-refund.parser.js"
import { LocalRefundService, type LocalRefundPreview } from "./local-refund.service.js"
import { parseOrderId } from "./order.parser.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("orders/:id")
export class LocalRefundController {
  constructor(
    @Inject(LocalRefundService) private readonly refunds: LocalRefundService,
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
  ) {}

  @Post("refund-preview")
  async preview(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<LocalRefundPreview> {
    this.refunds.ensureAvailable()
    return this.refunds.preview(this.identity.resolve(headers), parseOrderId(id), parseRefundSelection(body))
  }

  @Post("refund-simulation")
  async simulate(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<LocalRefundPreview & { readonly outcome: "succeeded" | "failed" }> {
    this.refunds.ensureAvailable()
    const input = parseRefundSimulation(body)
    return { ...await this.refunds.preview(this.identity.resolve(headers), parseOrderId(id), input), outcome: input.outcome }
  }
}
