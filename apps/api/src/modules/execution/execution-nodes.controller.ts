import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { ExecutionNodesService } from "./execution-nodes.service.js"
import { parseExecutionNodeInput, parseOccurrenceInput } from "./execution-nodes.parser.js"
type RequestHeaders = Record<string, string | readonly string[] | undefined>
@Controller("staff/execution/sessions/:sessionId")
export class ExecutionNodesController {
  constructor(@Inject(DevStaffAccessService) private readonly staff: DevStaffAccessService, @Inject(ExecutionNodesService) private readonly nodes: ExecutionNodesService) {}
  @Get("nodes")
  async list(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string) { return this.nodes.list(await this.staff.resolve(headers), sessionId) }
  @Post("nodes")
  async saveNode(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    return this.nodes.saveNode(await this.staff.resolveExecutionWrite(headers), sessionId, parseExecutionNodeInput(body))
  }
  @Post("occurrences")
  async saveOccurrence(@Headers() headers: RequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    return this.nodes.saveOccurrence(await this.staff.resolveExecutionWrite(headers), sessionId, parseOccurrenceInput(body))
  }
}
