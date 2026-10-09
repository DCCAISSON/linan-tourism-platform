import { Controller, Get, Header, Headers, Inject, Param } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { parseOrderId } from "../order/order.parser.js"
import { FamilyInsuranceService } from "./family-insurance.service.js"
import type { FamilyInsuranceResponse } from "./insurance.types.js"

@Controller("orders")
export class FamilyInsuranceController {
  constructor(
    @Inject(FamilyInsuranceService) private readonly insurance: FamilyInsuranceService,
    @Inject(EnrollmentIdentityService) private readonly identities: EnrollmentIdentityService,
  ) {}

  @Get(":orderId/insurance")
  @Header("Cache-Control", "private, no-store")
  async detail(@Headers() headers: Record<string, string | readonly string[] | undefined>, @Param("orderId") orderId: string): Promise<FamilyInsuranceResponse> {
    return this.insurance.detail(await this.identities.resolve(headers), parseOrderId(orderId))
  }
}
