import { BadRequestException } from "@nestjs/common"
import type { PersonRef } from "../travelers/travelers.types.js"
import type { PretripAdjustmentInput, PretripAdjustmentProcessInput, PretripConfigInput, PretripTravelMode } from "./pretrip.types.js"

export function parsePretripConfig(value: unknown): PretripConfigInput {
  const input = record(value)
  return {
    gatheringAt: nullableIso(input["gatheringAt"], "gatheringAt"),
    gatheringPlace: text(input["gatheringPlace"], "gatheringPlace", 255),
    travelMode: travelMode(input["travelMode"]),
    itineraryNote: text(input["itineraryNote"], "itineraryNote", 5000),
    contactName: text(input["contactName"], "contactName", 80),
    contactPhone: text(input["contactPhone"], "contactPhone", 40),
    serviceContact: text(input["serviceContact"], "serviceContact", 255),
    noticeVersionId: nullableText(input["noticeVersionId"], "noticeVersionId", 64),
    expectedVersion: integer(input["expectedVersion"], "expectedVersion"),
    attachments: array(input["attachments"], "attachments").map((item) => {
      const attachment = record(item)
      const id = optionalText(attachment["id"], "attachment.id", 64)
      return {
        ...(id === undefined ? {} : { id }),
        title: text(attachment["title"], "attachment.title", 120),
        objectKey: text(attachment["objectKey"], "attachment.objectKey", 255),
        contentType: text(attachment["contentType"], "attachment.contentType", 80),
        byteSize: integer(attachment["byteSize"], "attachment.byteSize"),
      }
    }),
  }
}

export function parsePretripAdjustment(value: unknown): PretripAdjustmentInput {
  const input = record(value)
  const kind = input["kind"]
  if (kind !== "vehicle_change" && kind !== "profile_correction") throw invalid("adjustment kind is invalid")
  return {
    kind,
    personRef: nullablePersonRef(input["personRef"]),
    requestText: text(input["requestText"], "requestText", 2000),
  }
}

export function parseAdjustmentProcess(value: unknown): PretripAdjustmentProcessInput {
  const input = record(value)
  const decision = input["decision"]
  if (decision !== "accepted" && decision !== "rejected") throw invalid("decision is invalid")
  return { decision, responseText: text(input["responseText"], "responseText", 2000) }
}

function travelMode(value: unknown): PretripTravelMode {
  if (value === "group" || value === "self" || value === "mixed") return value
  throw invalid("travelMode is invalid")
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("request body must be an object")
  return Object.fromEntries(Object.entries(value))
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalid(`${label} must be an array`)
  return value
}

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw invalid(`${label} must be a string`)
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxLength) throw invalid(`${label} length is invalid`)
  return normalized
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  return text(value, label, maxLength)
}

function nullableText(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null
  return text(value, label, maxLength)
}

function nullablePersonRef(value: unknown): PersonRef | null {
  const personRef = nullableText(value, "personRef", 96)
  if (personRef === null) return null
  if (/^(paid|imported):[^:\s]+$/.test(personRef)) return personRef as PersonRef
  throw invalid("personRef must be a stable paid:* or imported:* reference")
}

function nullableIso(value: unknown, label: string): string | null {
  const textValue = nullableText(value, label, 40)
  if (textValue === null) return null
  if (Number.isNaN(Date.parse(textValue))) throw invalid(`${label} must be an ISO date string`)
  return textValue
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw invalid(`${label} must be a non-negative integer`)
  return value
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "pretrip_invalid_input", message })
}
