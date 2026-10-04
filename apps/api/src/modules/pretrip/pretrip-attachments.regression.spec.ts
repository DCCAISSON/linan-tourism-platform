import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parsePretripConfig } from "./pretrip.parser.js"

const config = { gatheringAt: null, gatheringPlace: "学校南门", travelMode: "group", itineraryNote: "携带水杯", contactName: "服务人员", contactPhone: "19900000000", serviceContact: "服务台", noticeVersionId: null, expectedVersion: 1 }

describe("pretrip attachment selection", () => {
  it("preserves attachment selection when a configuration edit omits it", () => {
    // Given / When
    const parsed = parsePretripConfig(config)
    // Then
    expect(parsed).not.toHaveProperty("attachments")
  })

  it("rejects a caller supplied object key instead of attaching another stored object", () => {
    // Given
    const input = { ...config, attachments: [{ title: "外部文件", objectKey: "media/another-session/private.pdf", contentType: "application/pdf", byteSize: 12 }] }
    // When / Then
    expect(() => parsePretripConfig(input)).toThrow(BadRequestException)
  })
})
