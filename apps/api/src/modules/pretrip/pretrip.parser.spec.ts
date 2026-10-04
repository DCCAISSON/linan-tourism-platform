import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parseAdjustmentProcess, parsePretripAdjustment, parsePretripConfig } from "./pretrip.parser.js"

describe("pretrip request parser", () => {
  it("keeps notice version and existing attachment ids as references", () => {
    const parsed = parsePretripConfig({
      gatheringAt: "2026-10-01T08:00:00.000Z",
      gatheringPlace: "School gate",
      travelMode: "group",
      itineraryNote: "Bring water",
      contactName: "Operator",
      contactPhone: "13800000000",
      serviceContact: "wechat-service",
      noticeVersionId: "notice-v1",
      expectedVersion: 2,
      attachments: [{ id: "uploaded-attachment", title: "Guide" }],
    })

    expect(parsed.noticeVersionId).toBe("notice-v1")
    expect(parsed.attachments?.[0]).toEqual({ id: "uploaded-attachment", title: "Guide" })
  })

  it("accepts school profile correction as a request, not a direct mutation payload", () => {
    expect(parsePretripAdjustment({ kind: "profile_correction", personRef: "paid:line-1", requestText: "Name spelling needs correction" })).toEqual({
      kind: "profile_correction",
      personRef: "paid:line-1",
      requestText: "Name spelling needs correction",
    })
  })

  it("rejects adjustment person refs that are not stable paid/imported references", () => {
    expect(() => parsePretripAdjustment({ kind: "vehicle_change", personRef: "line-1", requestText: "Move this person" })).toThrow(BadRequestException)
    expect(() => parsePretripAdjustment({ kind: "vehicle_change", personRef: "paid:", requestText: "Move this person" })).toThrow(BadRequestException)
    expect(() => parsePretripAdjustment({ kind: "vehicle_change", personRef: "imported:teacher-1", requestText: "Move this person" })).not.toThrow()
  })

  it("rejects malformed processing decisions", () => {
    expect(() => parseAdjustmentProcess({ decision: "done", responseText: "ok" })).toThrow(BadRequestException)
  })
})

describe("pretrip GCJ-02 coordinates", () => {
  const input = { gatheringAt: null, gatheringPlace: "Gate A", travelMode: "group", itineraryNote: "Water", contactName: "Operator", contactPhone: "13800000000", serviceContact: "service", noticeVersionId: null, expectedVersion: 0, attachments: [] }
  it("preserves coordinates when both fields are supplied", () => {
    // Given / When
    const result = parsePretripConfig({ ...input, gatheringLatitude: 30.23, gatheringLongitude: 119.72 })
    // Then
    expect(result).toMatchObject({ gatheringLatitude: 30.23, gatheringLongitude: 119.72 })
  })
  it("distinguishes legacy omission from explicit clearing", () => {
    // Given / When / Then
    expect(parsePretripConfig(input)).not.toHaveProperty("gatheringLatitude")
    expect(parsePretripConfig({ ...input, gatheringLatitude: null, gatheringLongitude: null })).toMatchObject({ gatheringLatitude: null, gatheringLongitude: null })
  })
  it.each([[30, undefined], [undefined, 120], [null, 120], [30, null], [91, 120], [30, 181], [NaN, 120], [30, Infinity], ["30", 120]])("rejects invalid pair %s / %s", (gatheringLatitude, gatheringLongitude) => {
    // Given / When / Then
    expect(() => parsePretripConfig({ ...input, gatheringLatitude, gatheringLongitude })).toThrow(BadRequestException)
  })
})
