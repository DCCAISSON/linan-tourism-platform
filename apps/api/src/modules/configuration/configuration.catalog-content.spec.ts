import { describe, expect, it } from "vitest"
import { parseCatalogItem, parseCatalogItemPatch } from "./configuration.parser.js"

const catalog = { organizationId: "school-a", code: "lake", title: "湖畔研学", status: "active" } as const

describe("Catalog content input", () => {
  it("retains an introduction and HTTPS cover when supplied", () => {
    // Given
    const body = { ...catalog, description: "认识湿地植物，观察湖畔生态。", coverImageUrl: "https://assets.example.org/lake.jpg" }
    // When
    const parsed = parseCatalogItem(body)
    // Then
    expect(parsed).toMatchObject({ description: body.description, coverImageUrl: body.coverImageUrl })
  })

  it("keeps old create requests valid with empty optional content", () => {
    // Given / When
    const parsed = parseCatalogItem(catalog)
    // Then
    expect(parsed).toMatchObject({ description: "", coverImageUrl: "" })
  })

  it("permits clearing content without changing omitted fields", () => {
    // Given / When
    const parsed = parseCatalogItemPatch({ description: "", coverImageUrl: "" })
    // Then
    expect(parsed).toMatchObject({ description: "", coverImageUrl: "", title: undefined })
  })

  it.each(["http://assets.example.org/lake.jpg", "javascript:alert(1)", "not-a-url", 12])(
    "rejects unsafe or malformed cover %s",
    (coverImageUrl) => {
      // Given / When / Then
      expect(() => parseCatalogItem({ ...catalog, coverImageUrl })).toThrow()
    },
  )

  it("rejects an introduction exceeding the stored character limit", () => {
    // Given / When / Then
    expect(() => parseCatalogItem({ ...catalog, description: "研".repeat(4001) })).toThrow()
  })
})
