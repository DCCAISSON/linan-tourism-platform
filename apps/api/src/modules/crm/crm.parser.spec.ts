import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parseCrmCustomer, parseCrmFollowup } from "./crm.parser.js"

const adult = { organizationId: "school-a", displayName: "合成成人", birthDate: "1990-01-01", adultConfirmed: true, phone: "13800000000", source: "主动咨询", tags: ["亲子游"], marketingConsent: "unknown", ownerId: null, familyId: null, idempotencyKey: "customer-key" }

describe("CRM input boundaries", () => {
  it.each([{ birthDate: "2015-01-01" }, { adultConfirmed: false }, { birthDate: "2000-02-30" }, { health: "儿童健康资料" }, { participantKind: "student" }, { marketingConsent: "assumed" }, { tags: ["a", "a"] }])("rejects unsafe customer fields when %j", (change) => {
    // Given
    const input = { ...adult, ...change }
    // When / Then
    expect(() => parseCrmCustomer(input)).toThrow(BadRequestException)
  })
  it("accepts an explicitly confirmed adult when source and contact are supplied", () => {
    // Given / When
    const parsed = parseCrmCustomer(adult)
    // Then
    expect(parsed).toEqual(expect.objectContaining({ displayName: "合成成人", marketingConsent: "unknown" }))
  })
  it("rejects injected health fields when saving a followup", () => {
    // Given / When / Then
    expect(() => parseCrmFollowup({ content: "希望了解行程", nextFollowupAt: null, idempotencyKey: "followup-key", health: "private" })).toThrow(BadRequestException)
  })
})
