import { describe, expect, it } from "vitest"
import { hasContractSignature } from "../src/contract-signature"

describe("contract handwriting", () => {
  it.each([{ strokes: [] }, { strokes: [[{ x: 10, y: 10 }]] }, { strokes: [Array.from({ length: 12 }, () => ({ x: 10, y: 10 }))] }])("rejects empty, one-tap and stationary handwriting", ({ strokes }) => {
    expect(hasContractSignature({ width: 300, height: 180, strokes })).toBe(false)
  })
  it("accepts a legible moving stroke", () => {
    const signature = { width: 300, height: 180, strokes: [Array.from({ length: 12 }, (_, i) => ({ x: i * 8, y: i * 3 }))] }
    expect(hasContractSignature(signature)).toBe(true)
  })
  it("rejects writing after clear", () => {
    expect(hasContractSignature({ width: 300, height: 180, strokes: [] })).toBe(false)
  })
})
