import { describe, expect, it } from "vitest"
import { parseCatalogTemplate, parseTemplateLink, parseTemplateSchool, parseTemplateVersion } from "./catalog-template.parser.js"

describe("shared catalog template input", () => {
  it("accepts common content without school prices or dates", () => {
    // Given
    const body = { title: " 湿地观察 ", description: "观察水生植物", coverImageUrl: "https://example.org/wetland.jpg" }
    // When
    const result = parseCatalogTemplate(body)
    // Then
    expect(result).toEqual({ ...body, title: "湿地观察" })
  })

  it.each(["", " ", "研".repeat(161)])("rejects an invalid stored title", title => {
    // Given / When / Then
    expect(() => parseCatalogTemplate({ title })).toThrow()
  })

  it.each(["http://example.org/a.jpg", "javascript:alert(1)"])("rejects unsafe cover links", coverImageUrl => {
    // Given / When / Then
    expect(() => parseCatalogTemplate({ title: "课程", coverImageUrl })).toThrow()
  })

  it("distinguishes unlinking from an omitted template identity", () => {
    // Given / When / Then
    expect(parseTemplateLink({ templateId: null })).toBeNull()
    expect(() => parseTemplateLink({})).toThrow()
  })

  it.each([0, -1, 1.5, "1", undefined])("requires a positive template version", expectedVersion => {
    // Given / When / Then
    expect(() => parseTemplateVersion({ expectedVersion })).toThrow()
  })

  it("keeps school and course identifiers bounded", () => {
    // Given / When / Then
    expect(parseTemplateSchool({ organizationId: "school-a", code: "course-a" })).toEqual({ organizationId: "school-a", code: "course-a" })
    expect(() => parseTemplateSchool({ organizationId: "school-a", code: "a".repeat(65) })).toThrow()
  })
})
