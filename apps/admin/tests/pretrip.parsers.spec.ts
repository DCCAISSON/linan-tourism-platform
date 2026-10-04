import { describe, expect, it } from "vitest"
import { ApiError } from "@/api/configuration.errors"
import { parsePretripConfig, parseSchoolConfirmation, parseSchoolConfirmations } from "@/api/pretrip.parsers"

describe("pretrip admin response boundary", () => {
  it("parses config references and attachments", () => {
    const parsed = parsePretripConfig({
      tourSessionId: "session-1",
      gatheringAt: null,
      gatheringPlace: "Gate A",
      travelMode: "mixed",
      itineraryNote: "Read the notice",
      contactName: "Operator",
      contactPhone: "13800000000",
      serviceContact: "wechat-service",
      noticeVersionId: "notice-v1",
      version: 3,
      attachments: [{ id: "attachment-1", title: "Guide", contentType: "application/pdf", byteSize: 100 }],
    })

    expect(parsed.noticeVersionId).toBe("notice-v1")
    expect(parsed.attachments[0]?.id).toBe("attachment-1")
  })

  it("keeps stale confirmation state visible for re-sign", () => {
    const parsed = parseSchoolConfirmation({
      id: "sign-1",
      tourSessionId: "session-1",
      schoolId: "school-1",
      transportConfirmationId: "transport-sign-1",
      planVersion: 4,
      rosterVersion: "roster-v1",
      status: "stale",
      signedAt: "2026-09-23T00:00:00.000Z",
      signedByStaffId: "school-staff-1",
    })

    expect(parsed.status).toBe("stale")
    expect(parsed.planVersion).toBe(4)
  })

  it("rejects malformed confirmation lists", () => {
    expect(() => parseSchoolConfirmations({ items: [] })).toThrow(ApiError)
  })
})
