import { describe, expect, it } from "vitest"
import { parseFollowup, parseInquiry, parseProduct } from "./business.parser.js"
const product = {
  organizationId: "school-a", category: "tourism", title: "合成线路", offering: "一日线路",
  content: "景点及行程", referencePriceFen: 12000, customerServicePhone: "13800000000",
  bookingUrl: "", bookingAuthorized: false, media: [], mediaAuthorized: false, status: "draft",
}
describe("Business input boundaries", () => {
  it("accepts each distinct business category when the content is valid", () => {
    // Given / When / Then
    for (const category of ["tourism", "wellness", "homestay"]) expect(parseProduct({ ...product, category }).category).toBe(category)
  })
  it.each(["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "https://localhost/a", "https://example.com/a?q-signature=secret"])("rejects unsafe URL %s when provided as a booking destination", bookingUrl => {
    // Given / When / Then
    expect(() => parseProduct({ ...product, bookingUrl, bookingAuthorized: true })).toThrow()
  })
  it.each([-1, 1.1, "120", 100000000000])("rejects illegal reference price %s", referencePriceFen => {
    // Given / When / Then
    expect(() => parseProduct({ ...product, referencePriceFen })).toThrow()
  })
  it("requires authorization when a public media URL is configured", () => {
    // Given / When / Then
    expect(() => parseProduct({ ...product, media: [{ kind: "image", url: "https://example.com/a.jpg" }] })).toThrow()
  })
  it("accepts an authorized HTTPS destination without pretending it is a booking", () => {
    // Given / When / Then
    expect(parseProduct({ ...product, bookingUrl: "https://example.com/reserve", bookingAuthorized: true }).bookingUrl).toBe("https://example.com/reserve")
  })
  it("requires the unit name when an organization submits an inquiry", () => {
    // Given / When / Then
    expect(() => parseInquiry({ idempotencyKey: "request-key-123", customerType: "organization", organizationName: "", contactName: "测试成人", phone: "13800000000", request: "咨询安排" })).toThrow()
  })
  it("accepts only inquiry fields when a person submits", () => {
    // Given
    const input = { idempotencyKey: "request-key-123", customerType: "individual", organizationName: "", contactName: "测试成人", phone: "13800000000", request: "咨询安排" }
    // When / Then
    expect(parseInquiry(input)).toEqual(input)
    expect(() => parseInquiry({ ...input, paymentStatus: "paid" })).toThrow()
  })
  it("accepts a versioned staff followup when the status means processing", () => {
    // Given / When / Then
    expect(parseFollowup({ idempotencyKey: "test-key", expectedVersion: 1, status: "processing", ownerStaffAccountId: "staff-a", note: "已电话联系，待确认日期" }).status).toBe("processing")
  })
  it("rejects a booking status when staff records a followup", () => {
    // Given / When / Then
    expect(() => parseFollowup({ idempotencyKey: "test-key", expectedVersion: 1, status: "paid", ownerStaffAccountId: "staff-a", note: "x" })).toThrow()
  })
})
