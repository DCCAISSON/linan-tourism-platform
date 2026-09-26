import { describe, expect, it } from "vitest"
import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import { parseEnrollmentSubmission, parseFamilyMember } from "./enrollment.parser.js"

const member = { code: "child", displayName: "Child", schoolId: "school", gradeId: "grade", classId: "class", identityNumber: "110101201001010032", phone: "19900001111" }
const submission = { tourSessionId: "session", memberIds: ["child"], contactName: "Parent", emergencyContactName: "Parent", emergencyContactPhone: "19900001111", agreementVersion: FAMILY_ENROLLMENT_AGREEMENT_VERSION, schemaVersion: DOMAIN_SCHEMA_VERSION, noticeVersionId: "notice", noticeVersion: "v1" }

describe("Enrollment contact and common member input", () => {
  it("preserves explicit common-member consent when false", () => {
    expect(parseFamilyMember({ ...member, saveAsCommon: false })).toHaveProperty("saveAsCommon", false)
  })
  it("rejects non-boolean common-member consent", () => {
    expect(() => parseFamilyMember({ ...member, saveAsCommon: "false" })).toThrow()
  })
  it("preserves current parent contact on enrollment", () => {
    expect(parseEnrollmentSubmission({ ...submission, contactPhone: "19900002222" })).toHaveProperty("contactPhone", "19900002222")
  })
  it("rejects malformed contact phone", () => {
    expect(() => parseEnrollmentSubmission({ ...submission, contactPhone: "100" })).toThrow()
  })
  it("accepts older clients without new optional fields", () => {
    expect(() => parseEnrollmentSubmission(submission)).not.toThrow()
    expect(() => parseFamilyMember(member)).not.toThrow()
  })
})
