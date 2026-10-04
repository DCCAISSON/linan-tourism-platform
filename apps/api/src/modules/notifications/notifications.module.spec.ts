import { Test } from "@nestjs/testing"
import { describe, expect, it } from "vitest"
import { EnrollmentAutoNotificationService } from "./enrollment-auto-notification.service.js"
import { NotificationsModule } from "./notifications.module.js"

describe("NotificationsModule", () => {
  it("constructs the automatic enrollment notifier through Nest injection", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [NotificationsModule] }).compile()

    expect(moduleRef.get(EnrollmentAutoNotificationService)).toBeInstanceOf(EnrollmentAutoNotificationService)
  })
})
