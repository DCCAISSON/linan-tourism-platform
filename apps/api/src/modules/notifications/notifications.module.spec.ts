import { Test } from "@nestjs/testing"
import { describe, expect, it } from "vitest"
import { NotificationDispatchService } from "./notification-dispatch.service.js"
import { NotificationManagementService } from "./notification-management.service.js"
import { NotificationsModule } from "./notifications.module.js"
import { RecipientAuthorizationService } from "./recipient-authorization.service.js"

describe("NotificationsModule", () => {
  it("wires the API slice without external configuration or network access", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [NotificationsModule] }).compile()

    expect(moduleRef.get(NotificationManagementService)).toBeInstanceOf(NotificationManagementService)
    expect(moduleRef.get(NotificationDispatchService)).toBeInstanceOf(NotificationDispatchService)
    expect(moduleRef.get(RecipientAuthorizationService)).toBeInstanceOf(RecipientAuthorizationService)
    await moduleRef.close()
  }, 15_000)
})
