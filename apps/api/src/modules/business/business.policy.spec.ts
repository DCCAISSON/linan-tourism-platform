import { describe, expect, it } from "vitest"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { StaffAccountPermissionEntity } from "../../domain/entities/staff-account-permission.entity.js"
import { StaffAccountScopeEntity } from "../../domain/entities/staff-account-scope.entity.js"
import { isBusinessOwnerEligible } from "./business.policy.js"

describe("business inquiry owner eligibility", () => {
  it.each([
    ["active scoped owner", "active", null, "business.followup", "organization", "org-1", true],
    ["disabled account", "disabled", null, "business.followup", "organization", "org-1", false],
    ["expired account", "active", "2026-09-26T00:00:00Z", "business.followup", "organization", "org-1", false],
    ["expiry at current time", "active", "2026-09-27T00:00:00Z", "business.followup", "organization", "org-1", false],
    ["missing permission", "active", null, "business.read", "organization", "org-1", false],
    ["another organization", "active", null, "business.followup", "organization", "org-2", false],
    ["unrelated tour scope", "active", null, "business.followup", "tour_session", "org-1", false],
    ["global owner", "active", null, "business.followup", "all", null, true],
    ["school scope", "active", null, "business.followup", "school", "org-1", true],
  ])("%s", (_label, status, expiry, permission, scopeKind, scopeId, expected) => {
    // Given actual staff qualification fields and a fixed time.
    const account = Object.assign(new StaffAccountEntity(), { status, expiresAt: expiry === null ? null : new Date(expiry) })
    const permissions = [Object.assign(new StaffAccountPermissionEntity(), { permissionKey: permission })]
    const scopes = [Object.assign(new StaffAccountScopeEntity(), { scopeKind, scopeId })]
    // When the same policy used by listing and saving evaluates this owner.
    const result = isBusinessOwnerEligible(account, permissions, scopes, "org-1", new Date("2026-09-27T00:00:00Z"))
    // Then only active, unexpired and appropriately authorized owners are eligible.
    expect(result).toBe(expected)
  })
})
