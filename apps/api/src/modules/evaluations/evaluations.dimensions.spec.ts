import { ConflictException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { resolveDimensionObservations } from "./evaluations.dimensions.js"

const observations = [{ code: "participation", observation: "主动完成记录任务" }]
const standard = { id: "std-a", dimensions: [{ code: "participation", label: "参与态度", description: "参与事实" }] }
const previous = { standardId: "std-a", dimensionObservations: observations }

describe("dimension observation consistency", () => {
  it("keeps legacy standards and records with no dimension data compatible", () => {
    expect(resolveDimensionObservations({ standardId: "old-standard", dimensionObservations: null }, { id: "old-standard", dimensions: null }, undefined)).toEqual([])
  })
  it("preserves observations on an omitted field and clears only on an explicit empty array", () => {
    expect(resolveDimensionObservations(previous, standard, undefined)).toEqual(observations)
    expect(resolveDimensionObservations(previous, standard, [])).toEqual([])
  })
  it("requires explicit observations when applying a different standard to existing observations", () => {
    expect(() => resolveDimensionObservations(previous, { ...standard, id: "std-b" }, undefined)).toThrow(ConflictException)
  })
  it("accepts explicit clearing when applying a different standard", () => {
    expect(resolveDimensionObservations(previous, { id: "std-b", dimensions: [] }, [])).toEqual([])
  })
  it("rejects old codes after switching to another standard", () => {
    expect(() => resolveDimensionObservations(previous, { id: "std-b", dimensions: [] }, observations)).toThrow(ConflictException)
  })
  it("rejects duplicate facts and facts without a selected standard", () => {
    expect(() => resolveDimensionObservations(previous, standard, [...observations, ...observations])).toThrow(ConflictException)
    expect(() => resolveDimensionObservations(null, null, observations)).toThrow(ConflictException)
  })
})
