import { Body, Controller, Get, Headers, Inject, Param, Post, Put } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { CONTRACT_SOURCES } from "./contract-sources.js"
import { parseActiveTemplate, parseSignContract, parseTemplateInput } from "./contracts.parser.js"
import { assertContractPermission } from "./contracts.scope.js"
import { ContractsService } from "./contracts.service.js"
import type { ContractResponse, ContractSessionResponse, ContractSource, ContractTemplate } from "./contracts.types.js"

@Controller()
export class ContractsController {
  constructor(
    @Inject(ContractsService) private readonly contracts: ContractsService,
    @Inject(DevStaffAccessService) private readonly staff: DevStaffAccessService,
    @Inject(EnrollmentIdentityService) private readonly families: EnrollmentIdentityService,
  ) {}

  @Get("contracts/staff/sources")
  async sources(@Headers() headers: StaffAccessRequestHeaders): Promise<{ readonly sources: readonly ContractSource[] }> {
    assertContractPermission(await this.staff.resolve(headers), "configuration.read")
    return { sources: CONTRACT_SOURCES }
  }

  @Get("contracts/staff/sessions/:id")
  async session(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string): Promise<ContractSessionResponse> {
    return this.contracts.session(await this.staff.resolve(headers), id)
  }

  @Post("contracts/staff/sessions/:id/versions")
  async createVersion(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<ContractTemplate> {
    this.staff.assertUnsafeOrigin(headers)
    return this.contracts.createVersion(await this.staff.resolve(headers), id, parseTemplateInput(body))
  }

  @Put("contracts/staff/sessions/:id/active")
  async activate(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<ContractSessionResponse> {
    this.staff.assertUnsafeOrigin(headers)
    return this.contracts.activate(await this.staff.resolve(headers), id, parseActiveTemplate(body))
  }

  @Get("orders/:orderId/contract")
  async familyContract(@Headers() headers: StaffAccessRequestHeaders, @Param("orderId") orderId: string): Promise<ContractResponse> {
    return this.contracts.familyContract(await this.families.resolve(headers), orderId)
  }

  @Post("orders/:orderId/contract/sign")
  async sign(@Headers() headers: StaffAccessRequestHeaders, @Param("orderId") orderId: string, @Body() body: unknown): Promise<ContractResponse> {
    return this.contracts.sign(await this.families.resolve(headers), orderId, parseSignContract(body))
  }

  @Get("contracts/staff/orders/:orderId")
  async staffContract(@Headers() headers: StaffAccessRequestHeaders, @Param("orderId") orderId: string): Promise<ContractResponse> {
    return this.contracts.staffContract(await this.staff.resolve(headers), orderId)
  }
}
