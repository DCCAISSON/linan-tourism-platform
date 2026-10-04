import { ORDER_STATUS } from "@linan/contracts"
import { describe, expect, it } from "vitest"
import { orderAllowsFamilyNotificationAccess } from "./notification-access.service.js"

describe("family notification order access", () => {
  it("allows authorization before payment and keeps paid or refunded orders manageable", () => {
    expect(orderAllowsFamilyNotificationAccess(ORDER_STATUS.pendingPayment, 0)).toBe(true)
    expect(orderAllowsFamilyNotificationAccess(ORDER_STATUS.paid, 100)).toBe(true)
    expect(orderAllowsFamilyNotificationAccess(ORDER_STATUS.refunded, 100)).toBe(true)
  })

  it("rejects cancelled orders and invalid paid states", () => {
    expect(orderAllowsFamilyNotificationAccess(ORDER_STATUS.cancelled, 0)).toBe(false)
    expect(orderAllowsFamilyNotificationAccess(ORDER_STATUS.paid, 0)).toBe(false)
    expect(orderAllowsFamilyNotificationAccess(ORDER_STATUS.refunded, 0)).toBe(false)
  })
})
