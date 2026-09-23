import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parseAdjustmentProcess, parsePretripAdjustment, parsePretripConfig } from "./pretrip.parser.js"

describe("pretrip request parser", () => {
  it("keeps notice version as a reference and parses attachments without inventing ids", () => {
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
      attachments: [{ title: "Guide", objectKey: "pretrip/guide.pdf", contentType: "application/pdf", byteSize: 1234 }],
    })

    expect(parsed.noticeVersionId).toBe("notice-v1")
    expect(parsed.attachments[0]).toEqual({ title: "Guide", objectKey: "pretrip/guide.pdf", contentType: "application/pdf", byteSize: 1234 })
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
