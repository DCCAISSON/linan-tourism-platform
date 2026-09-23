import { Inject, Injectable } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { TourSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertTravelerActionable, readTravelers, resolveTraveler, toTravelerDto } from "../travelers/travelers.read-model.js"
import type { InternalTravelerSnapshot, PersonRef, TravelerRecord } from "../travelers/travelers.types.js"
import { transportConflict, malformedTransportInput, transportSessionNotFound } from "./transport.errors.js"
import { bumpTransportPlanVersion, ensureTransportPlan, requireExpectedPlanVersion } from "./transport-plan-store.js"
import { createTransportSuggestion } from "./transport-suggestion.js"
import { sessionScope, toPlan } from "./transport.plan.js"
import type {
  TransportAllocationRecord,
  TransportAssignmentResponse,
  TransportConfirmationInput,
  TransportConfirmationResponse,
  TransportPeoplePlanResponse,
  TransportPersonAssignmentsInput,
  TransportSuggestionInput,
  TransportSuggestionResponse,
} from "./transport.types.js"

type AssignmentRow = {
  readonly vehicleId: string
  readonly personRef: string
}

type VehicleSeatRow = {
  readonly id: string
  readonly seatCapacity: number | string
}

type ConfirmationRow = {
  readonly id: string
  readonly planVersion: number | string
  readonly rosterVersion: string
  readonly confirmedAt: Date | string
  readonly confirmedBy: string
}

@Injectable()
export class TransportPeopleService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async readPeoplePlan(access: StaffAccess, tourSessionId: string): Promise<TransportPeoplePlanResponse> {
    const manager = (await this.database.getDataSource()).manager
    const session = await this.requireSession(manager, tourSessionId)
    this.staffAccess.assertTransportReadScope(access, sessionScope(session))
    return this.buildPeoplePlan(manager, session)
  }

  async saveAssignments(
    access: StaffAccess,
    tourSessionId: string,
    input: TransportPersonAssignmentsInput,
  ): Promise<TransportPeoplePlanResponse> {
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const session = await this.requireSession(manager, tourSessionId)
      this.staffAccess.assertTransportWriteScope(access, sessionScope(session))
      await requireExpectedPlanVersion(manager, session.id, input.expectedPlanVersion)
      const snapshot = await readTravelers(manager, session.id)
      this.requireRosterVersion(snapshot.rosterVersion, input.expectedRosterVersion)
      const prepared = await this.prepareAssignments(manager, session.id, snapshot, input)
      await manager.query("delete from transport_person_allocations where tour_session_id = ?", [session.id])
      if (prepared.length > 0) {
        await manager.query(
          `insert into transport_person_allocations (id, tour_session_id, vehicle_id, person_ref, dedupe_key, created_by)
           values ${prepared.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
          prepared.flatMap((assignment) => [makeId("transport-person"), session.id, assignment.vehicleId, assignment.traveler.personRef, assignment.traveler.dedupeKey, access.actorId]),
        )
      }
      await bumpTransportPlanVersion(manager, session.id)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "transport.people.saved", targetType: "tour_session", targetId: session.id })
      return this.buildPeoplePlan(manager, session)
    })
  }

  async confirmPlan(access: StaffAccess, tourSessionId: string, input: TransportConfirmationInput): Promise<TransportPeoplePlanResponse> {
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const session = await this.requireSession(manager, tourSessionId)
      this.staffAccess.assertTransportWriteScope(access, sessionScope(session))
      await requireExpectedPlanVersion(manager, session.id, input.expectedPlanVersion)
      const snapshot = await readTravelers(manager, session.id)
      this.requireRosterVersion(snapshot.rosterVersion, input.expectedRosterVersion)
      const plan = await this.buildPeoplePlan(manager, session)
      if (plan.conflicts.length > 0) throw transportConflict("traveler_conflict", "人员来源存在冲突，不能确认车辆安排。")
      const confirmationId = makeId("transport-confirmation")
      await manager.query(
        `insert into transport_confirmations
          (id, tour_session_id, plan_version, roster_version, snapshot_json, confirmed_by, confirmed_at)
         values (?, ?, ?, ?, ?, ?, current_timestamp(6))`,
        [confirmationId, session.id, input.expectedPlanVersion, input.expectedRosterVersion, JSON.stringify(plan), access.actorId],
      )
      await manager.query("update transport_plans set current_confirmation_id = ? where tour_session_id = ?", [confirmationId, session.id])
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "transport.plan.confirmed", targetType: "tour_session", targetId: session.id })
      return this.buildPeoplePlan(manager, session)
    })
  }

  async suggestPlan(access: StaffAccess, tourSessionId: string, input: Omit<TransportSuggestionInput, "travelers">): Promise<TransportSuggestionResponse> {
    const manager = (await this.database.getDataSource()).manager
    const session = await this.requireSession(manager, tourSessionId)
    this.staffAccess.assertTransportWriteScope(access, sessionScope(session))
    const snapshot = await readTravelers(manager, session.id)
    const travelers = snapshot.travelers.filter((traveler) => traveler.active && traveler.conflict === null).map((traveler) => ({
      personRef: traveler.personRef,
      classId: traveler.classId,
    }))
    return createTransportSuggestion({ ...input, travelers })
  }

  private async buildPeoplePlan(manager: EntityManager, session: TourSessionEntity): Promise<TransportPeoplePlanResponse> {
    const snapshot = await readTravelers(manager, session.id)
    const planVersion = await ensureTransportPlan(manager, session.id)
    const classPlan = await this.loadClassPlan(manager, session, planVersion)
    const assignments = await this.loadAssignments(manager, snapshot)
    const assignedRefs = new Set(assignments.map((assignment) => assignment.personRef))
    const actualByVehicle = countActualAssignments(assignments)
    return {
      tourSessionId: session.id,
      organizationId: session.organizationId,
      planVersion,
      rosterVersion: snapshot.rosterVersion,
      vehicles: classPlan.vehicles.map((vehicle) => ({
        ...vehicle,
        estimatedOccupancy: vehicle.occupancy,
        actualOccupancy: actualByVehicle.get(vehicle.id) ?? 0,
        actualRemainingSeats: vehicle.seatCapacity - (actualByVehicle.get(vehicle.id) ?? 0),
      })),
      assignments,
      unassigned: snapshot.travelers.filter((traveler) => traveler.active && traveler.conflict === null && !assignedRefs.has(traveler.personRef)).map(toTravelerDto),
      conflicts: snapshot.travelers.filter((traveler) => traveler.conflict !== null).map(toTravelerDto),
      confirmation: await this.readConfirmation(manager, session.id, planVersion, snapshot.rosterVersion),
    }
  }

  private async loadClassPlan(manager: EntityManager, session: TourSessionEntity, planVersion: number) {
    const records: readonly TransportAllocationRecord[] = await manager.query(`
      select
        a.id as allocationId, v.id as vehicleId, v.sequence, v.seat_capacity as seatCapacity,
        v.plate_number as plateNumber, v.contact_snapshot_json as contactSnapshotJson,
        c.id as classId, c.name as className, g.name as gradeName,
        a.student_count as studentCount, a.guardian_count as guardianCount,
        a.teacher_count as teacherCount, a.other_count as otherCount, a.note
      from transport_session_vehicles v
      left join transport_class_allocations a on a.vehicle_id = v.id
      left join school_classes c on c.id = a.class_id
      left join school_grades g on g.id = c.grade_id
      where v.tour_session_id = ?
      order by v.sequence, g.code, c.code, a.id
    `, [session.id])
    return toPlan(session, records, planVersion)
  }

  private async loadAssignments(manager: EntityManager, snapshot: InternalTravelerSnapshot): Promise<readonly TransportAssignmentResponse[]> {
    const rows: readonly AssignmentRow[] = await manager.query(
      "select vehicle_id as vehicleId, person_ref as personRef from transport_person_allocations where tour_session_id = ? order by created_at, id",
      [snapshot.tourSessionId],
    )
    return rows.map((row) => {
      const traveler = resolveTraveler(snapshot, this.parseStoredPersonRef(row.personRef))
      return {
        personRef: traveler.personRef,
        vehicleId: row.vehicleId,
        displayName: traveler.displayName,
        className: traveler.className,
        importedRole: traveler.importedRole,
        active: traveler.active,
        conflict: traveler.conflict,
      }
    })
  }

  private async prepareAssignments(
    manager: EntityManager,
    tourSessionId: string,
    snapshot: InternalTravelerSnapshot,
    input: TransportPersonAssignmentsInput,
  ): Promise<readonly { readonly vehicleId: string; readonly traveler: TravelerRecord }[]> {
    const vehicleRows: readonly VehicleSeatRow[] = await manager.query(
      "select id, seat_capacity as seatCapacity from transport_session_vehicles where tour_session_id = ?",
      [tourSessionId],
    )
    const capacities = new Map(vehicleRows.map((row) => [row.id, Number(row.seatCapacity)]))
    const usedDedupeKeys = new Set<string>()
    const byVehicle = new Map<string, number>()
    const prepared = input.assignments.map((assignment) => {
      if (!capacities.has(assignment.vehicleId)) throw malformedTransportInput("人员分配包含不属于当前团期的车辆")
      const traveler = resolveTraveler(snapshot, assignment.personRef)
      assertTravelerActionable(traveler)
      if (usedDedupeKeys.has(traveler.dedupeKey)) throw transportConflict("duplicate_traveler_assignment", "同一实际人员不能重复分配车辆。")
      usedDedupeKeys.add(traveler.dedupeKey)
      byVehicle.set(assignment.vehicleId, (byVehicle.get(assignment.vehicleId) ?? 0) + 1)
      return { vehicleId: assignment.vehicleId, traveler }
    })
    for (const [vehicleId, count] of byVehicle) {
      if (count > (capacities.get(vehicleId) ?? 0)) throw transportConflict("vehicle_over_capacity", "逐人分配超过车辆可用座位。")
    }
    return prepared
  }

  private async readConfirmation(
    manager: EntityManager,
    tourSessionId: string,
    planVersion: number,
    rosterVersion: string,
  ): Promise<TransportConfirmationResponse | null> {
    const rows: readonly ConfirmationRow[] = await manager.query(`
      select c.id, c.plan_version as planVersion, c.roster_version as rosterVersion, c.confirmed_at as confirmedAt, c.confirmed_by as confirmedBy
      from transport_plans p join transport_confirmations c on c.id = p.current_confirmation_id
      where p.tour_session_id = ?
      limit 1
    `, [tourSessionId])
    const row = rows[0]
    if (row === undefined) return null
    return {
      id: row.id,
      planVersion: Number(row.planVersion),
      rosterVersion: row.rosterVersion,
      status: Number(row.planVersion) === planVersion && row.rosterVersion === rosterVersion ? "current" : "stale",
      confirmedAt: row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : row.confirmedAt,
      confirmedBy: row.confirmedBy,
    }
  }

  private requireRosterVersion(current: string, expected: string): void {
    if (current !== expected) throw transportConflict("stale_roster", "出行名单版本已更新，请刷新后重试。")
  }

  private parseStoredPersonRef(value: string): PersonRef {
    if (isPersonRef(value)) return value
    throw malformedTransportInput("人员引用格式不正确")
  }

  private async requireSession(manager: EntityManager, tourSessionId: string): Promise<TourSessionEntity> {
    const session = await manager.findOneBy(TourSessionEntity, { id: tourSessionId })
    if (session === null) throw transportSessionNotFound()
    return session
  }
}

function isPersonRef(value: string): value is PersonRef {
  return value.startsWith("paid:") || value.startsWith("imported:")
}

function countActualAssignments(assignments: readonly TransportAssignmentResponse[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const assignment of assignments) {
    if (assignment.active && assignment.conflict === null) {
      counts.set(assignment.vehicleId, (counts.get(assignment.vehicleId) ?? 0) + 1)
    }
  }
  return counts
}
