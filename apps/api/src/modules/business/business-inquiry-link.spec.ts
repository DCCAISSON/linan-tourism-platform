import { describe, expect, it } from "vitest"
import { parseCustomerLink } from "./business.parser.js"
import { assertInquiryCustomerAccess } from "./business-inquiry-links.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"

const access: StaffAccess = { kind: "administrator", forcePasswordChange: false, actorId: "staff", permissionKeys: new Set(["business.followup", "crm.read", "crm.write"]), scopes: [{ kind: "organization", id: "org" }] }

describe("explicit inquiry customer links", () => {
  it("accepts a chosen customer or explicit unlink with the inquiry version", () => {
    expect(parseCustomerLink({ customerId: "customer", expectedVersion: 1 })).toEqual({ customerId: "customer", expectedVersion: 1 })
    expect(parseCustomerLink({ customerId: null, expectedVersion: 2 }).customerId).toBeNull()
  })
  it.each([{ customerId: "", expectedVersion: 1 }, { expectedVersion: 1 }, { customerId: null, expectedVersion: 0 }, { customerId: "c", expectedVersion: 1, phone: "13800000000" }])("rejects malformed or inferred links %j", input => {
    expect(() => parseCustomerLink(input)).toThrow()
  })
  it("requires both business and CRM permissions and matching scope", () => {
    expect(() => assertInquiryCustomerAccess(access, "org", true)).not.toThrow()
    for (const permissionKeys of [new Set(["business.followup"] as const), new Set(["crm.read", "crm.write"] as const), new Set(["business.followup", "crm.read"] as const)]) {
      expect(() => assertInquiryCustomerAccess({ ...access, permissionKeys }, "org", true)).toThrow()
    }
    expect(() => assertInquiryCustomerAccess(access, "other-org", false)).toThrow()
    expect(() => assertInquiryCustomerAccess({ ...access, permissionKeys: new Set(["business.followup", "crm.read"]) }, "org", false)).not.toThrow()
  })
})
