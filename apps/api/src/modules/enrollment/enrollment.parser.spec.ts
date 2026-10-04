import { describe, expect, it } from "vitest"
import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import { parseEnrollmentSubmission, parseFamilyMember, parseFamilyMemberPatch } from "./enrollment.parser.js"

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

describe.each([
  { field: "participant name on creation", parse: (name: string) => parseFamilyMember({ ...member, displayName: name }).displayName },
  { field: "participant name on update", parse: (name: string) => parseFamilyMemberPatch({ displayName: name }).displayName },
  { field: "parent contact name", parse: (name: string) => parseEnrollmentSubmission({ ...submission, contactName: name }).contactName },
  { field: "emergency contact name", parse: (name: string) => parseEnrollmentSubmission({ ...submission, emergencyContactName: name }).emergencyContactName },
])("Enrollment $field", ({ parse }) => {
  it.each(["7", "张3", "Alice7", "---", "·", "张_三", "-Alice", "Alice'", "张\n三", "张\t三"])("rejects invalid name %j", (name) => {
    // Given
    const input = name
    // When
    const parseInput = () => parse(input)
    // Then
    expect(parseInput).toThrow("姓名只能填写中文汉字或英文字母")
  })

  it.each(["张三", "欧阳明", "张", "Alice Smith", "Anne-Marie", "O'Connor", "O’Connor", "阿卜杜拉·买买提", "山田・太郎", "  张三  "])("accepts valid name %j", (name) => {
    // Given
    const input = name
    // When
    const result = parse(input)
    // Then
    expect(result).toBe(name.trim())
  })

  it("retains the existing name length limit", () => {
    // Given
    const input = "张".repeat(121)
    // When
    const parseInput = () => parse(input)
    // Then
    expect(parseInput).toThrow("at most 120 characters")
  })
})

it("leaves the existing name untouched when a member patch omits it", () => {
  // Given
  const input = { gradeId: "grade" }
  // When
  const result = parseFamilyMemberPatch(input)
  // Then
  expect(result.displayName).toBeUndefined()
})
