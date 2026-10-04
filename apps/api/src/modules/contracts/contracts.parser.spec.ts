import { describe, expect, it } from "vitest"
import { parseContractSignature, parseSignContract, parseTemplateInput } from "./contracts.parser.js"

const signature = { width: 300, height: 160, strokes: [Array.from({ length: 12 }, (_, index) => ({ x: 10 + index * 10, y: 20 + index * 5 }))] }

describe("Contract input boundary", () => {
  it("accepts finite handwriting when ink has sufficient points and length", () => {
    expect(parseContractSignature(signature)).toEqual(signature)
  })
  it.each([
    { ...signature, strokes: [] },
    { ...signature, strokes: [Array.from({ length: 12 }, () => ({ x: 10, y: 20 }))] },
    { ...signature, strokes: [[{ x: -1, y: 20 }]] },
    { ...signature, strokes: [Array.from({ length: 5001 }, () => ({ x: 10, y: 20 }))] },
    { ...signature, width: Infinity },
    { ...signature, url: "https://example.invalid/signature.png" },
  ])("rejects invalid or oversized ink when untrusted signature is submitted", (input) => {
    expect(() => parseContractSignature(input)).toThrow()
  })
  it("requires explicit agreement when a parent signs", () => {
    expect(() => parseSignContract({ snapshotHash: "a".repeat(64), signerName: "测试家长", agreed: false, signature })).toThrow()
  })
  it("requires review when staff create a version", () => {
    expect(() => parseTemplateInput({ sourceId: "source", title: "合同", version: "v1", bodyText: "合同正文", reviewed: false })).toThrow()
  })
})
