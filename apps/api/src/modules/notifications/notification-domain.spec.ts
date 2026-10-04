import { describe, expect, it } from "vitest"
import { canDispatchTarget, isAuthorizationCurrent, notificationTaskFingerprint, summarizeTaskStatus } from "./notification-domain.js"

describe("notification task idempotency", () => {
  it("separates business sources with the same content and recipients", () => {
    expect(notificationTaskFingerprint("content", ["recipient"], "source-a"))
      .not.toBe(notificationTaskFingerprint("content", ["recipient"], "source-b"))
  })
  it("uses the selected target set independent of request order", () => {
    expect(notificationTaskFingerprint("content-1", ["authorization-2", "authorization-1"]))
      .toBe(notificationTaskFingerprint("content-1", ["authorization-1", "authorization-2"]))
  })
})

describe("notification dispatch state", () => {
  it("only sends pending targets initially and explicit retryable targets on retry", () => {
    expect(canDispatchTarget("initial", "pending")).toBe(true)
    expect(canDispatchTarget("initial", "retryable_failed")).toBe(false)
    expect(canDispatchTarget("retry", "retryable_failed")).toBe(true)
    expect(canDispatchTarget("retry", "manual_required")).toBe(false)
    expect(canDispatchTarget("retry", "api_accepted")).toBe(false)
  })

  it("does not treat API acceptance as read and closes a finished ledger", () => {
    expect(summarizeTaskStatus(["api_accepted", "undelivered"])).toBe("completed")
    expect(summarizeTaskStatus(["api_accepted", "manual_required"])).toBe("manual_required")
    expect(summarizeTaskStatus(["retryable_failed"])).toBe("retryable_failed")
  })

  it("blocks a withdrawn or changed recipient before provider dispatch", () => {
    expect(isAuthorizationCurrent(false, 2, 1)).toBe(false)
    expect(isAuthorizationCurrent(true, 2, 1)).toBe(false)
    expect(isAuthorizationCurrent(true, 1, 1)).toBe(true)
  })
})
