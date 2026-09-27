import { describe, expect, it } from "vitest"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { parseTourSession, parseTourSessionPatch } from "./configuration.parser.js"
import { updateTourSessionEntity } from "./configuration.persistence.js"
import { ensureTourSessionDates, requireEnrollmentWindow } from "./configuration.tour-session.js"

const body = {
  organizationId: "school", catalogItemId: "catalog", code: "trip", status: "published",
  priceFen: 12800, capacity: 30, startsAt: "2027-02-01T00:00:00Z", endsAt: "2027-02-02T00:00:00Z",
  enrollmentOpensAt: "2026-09-01T00:00:00Z", enrollmentClosesAt: "2027-01-01T00:00:00Z",
}

describe("Optional minimum participant reference", () => {
  it.each([undefined, null, 1, 30])("accepts %s on create and defaults omission to disabled", (minimumParticipants) => {
    // Given
    const input = minimumParticipants === undefined ? body : { ...body, minimumParticipants }
    // When
    const result = parseTourSession(input)
    // Then
    expect(result).toMatchObject({ minimumParticipants: minimumParticipants ?? null })
  })

  it.each([0, -1, 1.5, "10", 31, Number.MAX_SAFE_INTEGER + 1])("rejects invalid minimum %s", (minimumParticipants) => {
    // Given / When / Then
    expect(() => parseTourSession({ ...body, minimumParticipants })).toThrow()
  })

  it("retains the configured minimum when a patch omits it", () => {
    // Given
    const session = Object.assign(new TourSessionEntity(), { minimumParticipants: 10 })
    // When
    updateTourSessionEntity(session, parseTourSessionPatch({ code: "updated" }))
    // Then
    expect(session.minimumParticipants).toBe(10)
  })

  it("clears the configured minimum when a patch uses null", () => {
    // Given
    const session = Object.assign(new TourSessionEntity(), { minimumParticipants: 10 })
    // When
    updateTourSessionEntity(session, parseTourSessionPatch({ minimumParticipants: null }))
    // Then
    expect(session.minimumParticipants).toBeNull()
  })

  it("rejects capacity reduction below the retained minimum", () => {
    // Given
    const session = Object.assign(new TourSessionEntity(), { capacity: 30, minimumParticipants: 10 })
    updateTourSessionEntity(session, parseTourSessionPatch({ capacity: 9 }))
    // When / Then
    expect(() => ensureTourSessionDates(session)).toThrow()
  })

  it("returns the stored minimum in the session read model", () => {
    // Given
    const session = Object.assign(new TourSessionEntity(), parseTourSession({ ...body, minimumParticipants: 10 }))
    // When
    const response = requireEnrollmentWindow(session)
    // Then
    expect(response).toMatchObject({ minimumParticipants: 10 })
  })
})
