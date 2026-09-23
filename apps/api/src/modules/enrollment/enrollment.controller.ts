import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post } from "@nestjs/common"
import { EnrollmentIdentityService } from "./enrollment.identity.js"
import { parseEnrollmentSubmission, parseFamilyMember, parseFamilyMemberPatch } from "./enrollment.parser.js"
import { EnrollmentService } from "./enrollment.service.js"
import type { EnrollmentSubmissionResponse, FamilyMemberResponse } from "./enrollment.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller()
export class EnrollmentController {
  constructor(
    @Inject(EnrollmentService) private readonly enrollment: EnrollmentService,
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
  ) {}

  @Post("enrollment/members")
  async createMember(
    @Headers() headers: RequestHeaders,
    @Body() body: unknown,
  ): Promise<FamilyMemberResponse> {
    return this.enrollment.createMember(await this.identity.resolve(headers), parseFamilyMember(body))
  }

  @Get("enrollment/members")
  async listMembers(@Headers() headers: RequestHeaders): Promise<readonly FamilyMemberResponse[]> {
    return this.enrollment.listMembers(await this.identity.resolve(headers))
  }

  @Get("enrollment/members/:id")
  async getMember(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
  ): Promise<FamilyMemberResponse> {
    return this.enrollment.getMember(await this.identity.resolve(headers), id)
  }

  @Patch("enrollment/members/:id")
  async updateMember(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FamilyMemberResponse> {
    return this.enrollment.updateMember(await this.identity.resolve(headers), id, parseFamilyMemberPatch(body))
  }

  @Delete("enrollment/members/:id")
  async deleteMember(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
  ): Promise<void> {
    await this.enrollment.deleteMember(await this.identity.resolve(headers), id)
  }

  @Post("enrollments")
  async submitEnrollment(
    @Headers() headers: RequestHeaders,
    @Body() body: unknown,
  ): Promise<EnrollmentSubmissionResponse> {
    return this.enrollment.submitEnrollment(await this.identity.resolve(headers), parseEnrollmentSubmission(body))
  }
}
