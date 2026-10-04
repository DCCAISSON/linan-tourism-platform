import { Controller, Get } from "@nestjs/common"
import type { HealthResponse } from "@linan/contracts"

@Controller()
export class HealthController {
  @Get("health")
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "@linan/api",
      revision: process.env["REVISION"] ?? "local",
    }
  }
}
