import type { EntityManager } from "typeorm"
import { readTravelers } from "../travelers/travelers.read-model.js"
import type { PersonRef } from "../travelers/travelers.types.js"
import { transportConflict } from "./transport.errors.js"

export type ConfirmedTransportSnapshot = {
  readonly vehicles: readonly {
    readonly id: string
    readonly sequence: number
    readonly plateNumber: string
    readonly guideName: string | null
    readonly guidePhone: string | null
    readonly driverName: string | null
    readonly driverPhone: string | null
    readonly teacherName: string | null
    readonly teacherPhone: string | null
  }[]
  readonly assignments: readonly {
    readonly personRef: PersonRef
    readonly vehicleId: string
    readonly displayName: string
    readonly className: string | null
    readonly gradeName: string | null
    readonly schoolName: string | null
    readonly participantKind: "student" | "adult" | null
    readonly importedRole: "student" | "guardian" | "teacher" | null
  }[]
}

type ConfirmationVersion = { readonly planVersion: number; readonly rosterVersion: string }
export type TransportConfirmationState = ConfirmationVersion & (
  | { readonly status: "unconfirmed"; readonly confirmationId: null; readonly snapshot: null }
  | { readonly status: "stale"; readonly confirmationId: string; readonly snapshot: null }
  | { readonly status: "current"; readonly confirmationId: string; readonly snapshot: ConfirmedTransportSnapshot }
)

type ConfirmationRow = {
  readonly id: string
  readonly planVersion: number | string
  readonly rosterVersion: string
  readonly snapshotJson: unknown
  readonly currentPlanVersion: number | string
}

export async function readTransportConfirmation(manager: EntityManager, tourSessionId: string): Promise<TransportConfirmationState> {
  const travelers = await readTravelers(manager, tourSessionId)
  const rows: readonly ConfirmationRow[] = await manager.query(`
    select c.id, c.plan_version as planVersion, c.roster_version as rosterVersion, c.snapshot_json as snapshotJson, p.version as currentPlanVersion
    from transport_plans p join transport_confirmations c on c.id = p.current_confirmation_id
    where p.tour_session_id = ? limit 1`, [tourSessionId])
  const row = rows[0]
  if (row === undefined) return { status: "unconfirmed", confirmationId: null, planVersion: 0, rosterVersion: travelers.rosterVersion, snapshot: null }
  const version = { confirmationId: row.id, planVersion: Number(row.planVersion), rosterVersion: row.rosterVersion }
  if (Number(row.currentPlanVersion) !== version.planVersion || row.rosterVersion !== travelers.rosterVersion) {
    return { ...version, status: "stale", snapshot: null }
  }
  return { ...version, status: "current", snapshot: parseConfirmedTransportSnapshot(row.snapshotJson) }
}

export function parseConfirmedTransportSnapshot(value: unknown): ConfirmedTransportSnapshot {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value
  const root = record(parsed)
  return {
    vehicles: array(root["vehicles"]).map(item => {
      const vehicle = record(item)
      const contact = record(vehicle["contact"] ?? vehicle["contactSnapshot"] ?? {})
      return {
        id: text(vehicle["id"]), sequence: Number(vehicle["sequence"]) || 0, plateNumber: text(vehicle["plateNumber"]),
        guideName: optionalText(contact["guideName"]), guidePhone: optionalText(contact["guidePhone"]),
        driverName: optionalText(contact["driverName"]), driverPhone: optionalText(contact["driverPhone"]),
        teacherName: optionalText(contact["teacherName"]), teacherPhone: optionalText(contact["teacherPhone"]),
      }
    }),
    assignments: array(root["assignments"]).map(record)
      .filter(assignment => assignment["active"] !== false && assignment["conflict"] == null).map(assignment => {
      const personRef = text(assignment["personRef"])
      if (!isPersonRef(personRef)) throw transportConflict("invalid_confirmation", "确认名单中的人员引用无效，请重新确认安排。")
      const participantKind = assignment["participantKind"]
      const importedRole = assignment["importedRole"]
      return {
        personRef, vehicleId: text(assignment["vehicleId"]), displayName: text(assignment["displayName"]),
        className: optionalText(assignment["className"]), gradeName: optionalText(assignment["gradeName"]),
        schoolName: optionalText(assignment["schoolName"]),
        participantKind: participantKind === "student" || participantKind === "adult" ? participantKind : null,
        importedRole: importedRole === "student" || importedRole === "guardian" || importedRole === "teacher" ? importedRole : null,
      }
    }),
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}
}
function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : [] }
function text(value: unknown): string { return typeof value === "string" ? value : "" }
function optionalText(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null }
function isPersonRef(value: string): value is PersonRef { return value.startsWith("paid:") || value.startsWith("imported:") }
