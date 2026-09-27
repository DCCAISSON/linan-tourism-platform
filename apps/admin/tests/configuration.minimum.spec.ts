import { describe, expect, it } from "vitest"
import { parseTourSession } from "../src/api/configuration.parsers"

describe("Minimum participant configuration response", () => {
  it("retains the configured minimum and paid headcount", () => {
    const result = parseTourSession({ capacity: 30, minimumParticipants: 20, occupiedCapacity: 5 })
    expect(result).toMatchObject({ minimumParticipants: 20, occupiedCapacity: 5 })
  })
  it("keeps omitted values unset rather than reporting zero people", () => {
    const result = parseTourSession({ capacity: 30 })
    expect(result).toMatchObject({ minimumParticipants: null, occupiedCapacity: null })
  })
  it.each([0, -1, 1.5, 31, "20"])("rejects malformed minimum %s", (minimumParticipants) => {
    expect(() => parseTourSession({ capacity: 30, minimumParticipants })).toThrow()
  })
})
