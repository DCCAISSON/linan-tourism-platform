import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import type { StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { parseFeedbackReview, parseServiceFeedback } from "./feedback.parser.js"
import { FeedbackService } from "./feedback.service.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("feedback")
export class FeedbackController {
  constructor(
    @Inject(FeedbackService) private readonly feedback: FeedbackService,
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
  ) {}

  @Post("family")
  async family(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    return this.feedback.submitFamily(await this.identity.resolve(headers), parseServiceFeedback(body))
  }

  @Get("public/sessions/:sessionId")
  async publicList(@Param("sessionId") sessionId: string) {
    return this.feedback.publicList(sessionId)
  }

  @Get("staff/sessions/:sessionId")
  async dashboard(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string) {
    return this.feedback.dashboard(await this.access.resolve(headers), sessionId)
  }

  @Post("staff/school")
  async school(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.feedback.submitSchool(await this.access.resolve(headers), parseServiceFeedback(body))
  }

  @Post("staff/:id/review")
  async review(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.feedback.review(await this.access.resolve(headers), id, parseFeedbackReview(body))
  }
}
