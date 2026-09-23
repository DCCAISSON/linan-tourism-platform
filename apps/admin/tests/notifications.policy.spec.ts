import { describe, expect, it } from "vitest"
import { canRetryNotificationTargets, createNotificationPreviewSelection, isNotificationPreviewCurrent, notificationAttemptTargetLabel } from "@/api/notifications.policy"

describe("notification page policies", () => {
  it("keeps a preview bound to the loaded session and authorization snapshot", () => {
    const ids = ["authorization-1"]
    const selection = createNotificationPreviewSelection("session-1", ids)
    ids.push("authorization-2")

    expect(selection.authorizationIds).toEqual(["authorization-1"])
    expect(isNotificationPreviewCurrent(selection, "session-1", ["authorization-1"])).toBe(true)
    expect(isNotificationPreviewCurrent(selection, "session-2", ["authorization-1"])).toBe(false)
    expect(isNotificationPreviewCurrent(selection, "session-1", ["authorization-2"])).toBe(false)
  })

  it("enables explicit retry when any target is retryable despite the task summary", () => {
    expect(canRetryNotificationTargets([{ status: "manual_required" }, { status: "retryable_failed" }])).toBe(true)
    expect(canRetryNotificationTargets([{ status: "manual_required" }, { status: "api_accepted" }])).toBe(false)
  })

  it("maps an attempt to its receiver and preserves unknown target ids", () => {
    const targets = [{ id: "target-1", receiverName: "林女士" }]
    expect(notificationAttemptTargetLabel("target-1", targets)).toBe("林女士 · target-1")
    expect(notificationAttemptTargetLabel("missing", targets)).toBe("missing")
  })
})
