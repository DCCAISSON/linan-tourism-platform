import { describe, expect, it } from "vitest"
import { parseCreateStaffAccount } from "./staff-auth.parser.js"

describe("explicit business permission grants", () => {
  it("accepts the selected new business grants when creating an account", () => {
    // Given: an administrator explicitly selects a bounded set of permissions.
    const selected = ["roster.correct", "refunds.review", "refunds.execute", "media.read", "crm.write", "business.followup"]
    const payload = { username: "reviewer", displayName: "审核员", temporaryPassword: "test-password-123", permissionKeys: selected, scopes: [{ kind: "all", id: null }] }
    // When: the account request crosses the API boundary.
    const account = parseCreateStaffAccount(payload)
    // Then: only the selected grants are included.
    expect(account.permissionKeys).toEqual(selected)
  })

  it("keeps existing permissions unchanged when no new grants are selected", () => {
    // Given: a pre-existing account creation payload.
    const payload = { username: "reader", displayName: "只读账号", temporaryPassword: "test-password-123", permissionKeys: ["roster.read"], scopes: [{ kind: "all", id: null }] }
    // When: the account request is parsed after the whitelist grows.
    const account = parseCreateStaffAccount(payload)
    // Then: no new grant is inferred.
    expect(account.permissionKeys).toEqual(["roster.read"])
  })
})
