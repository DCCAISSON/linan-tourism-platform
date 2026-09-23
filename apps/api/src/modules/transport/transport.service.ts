import { Inject, Injectable } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import {
  SchoolClassEntity,
  SchoolGradeEntity,
  TourSessionEntity,
  TransportClassAllocationEntity,
  TransportSessionVehicleEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { malformedTransportInput, transportConflict, transportForbidden, transportSessionNotFound } from "./transport.errors.js"
import { bumpTransportPlanVersion, ensureTransportPlan } from "./transport-plan-store.js"
import { hasContactValue, redactContactSnapshots, sessionScope, textOrNull, toPlan, validateAllocation, validateVehicle, vehicleOccupancy } from "./transport.plan.js"
import type {
  TransportAllocationRecord,
  TransportPlanInput,
  TransportPlanResponse,
  TransportVehicleInput,
} from "./transport.types.js"

type VehicleRow = {
  readonly id: string
  readonly sequence: number | string
}

type CountRow = {
  readonly count: number | string
}

@Injectable()
export class TransportService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async readPlan(access: StaffAccess, tourSessionId: string): Promise<TransportPlanResponse> {
    const manager = (await this.database.getDataSource()).manager
    const session = await this.requireSession(manager, tourSessionId)
    this.staffAccess.assertTransportReadScope(access, sessionScope(session))
    const plan = await this.loadPlan(manager, session)
    return access.permissionKeys.has("sensitive_data.read") ? plan : redactContactSnapshots(plan)
  }

  async savePlan(access: StaffAccess, tourSessionId: string, input: TransportPlanInput): Promise<TransportPlanResponse> {
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
	      const session = await this.requireSession(manager, tourSessionId)
	      this.staffAccess.assertTransportWriteScope(access, sessionScope(session))
	      await this.validatePlan(manager, access, session, input)
	      await this.upsertVehicles(manager, session, access.actorId, input)
	      await bumpTransportPlanVersion(manager, session.id)
	      await this.audit.record(manager, {
        organizationId: session.organizationId,
        actorId: access.actorId,
        action: "transport.plan.saved",
        targetType: "tour_session",
        targetId: session.id,
      })
      return this.loadPlan(manager, session)
    })
  }

  async exportPlan(access: StaffAccess, tourSessionId: string): Promise<TransportPlanResponse> {
    const manager = (await this.database.getDataSource()).manager
    const session = await this.requireSession(manager, tourSessionId)
    this.staffAccess.assertTransportExportScope(access, sessionScope(session))
    const plan = await this.loadPlan(manager, session)
    if (plan.vehicles.some(hasContactValue) && !access.permissionKeys.has("sensitive_data.read")) {
      throw transportForbidden("staff identity cannot export transport contacts")
    }
    await this.audit.record(manager, {
      organizationId: session.organizationId,
      actorId: access.actorId,
      action: "transport.plan.exported",
      targetType: "tour_session",
      targetId: session.id,
    })
    return plan
  }

  private async requireSession(manager: EntityManager, tourSessionId: string): Promise<TourSessionEntity> {
    const session = await manager.findOneBy(TourSessionEntity, { id: tourSessionId })
    if (session === null) {
      throw transportSessionNotFound()
    }
    return session
  }

  private async validatePlan(
    manager: EntityManager,
    access: StaffAccess,
    session: TourSessionEntity,
    input: TransportPlanInput,
  ): Promise<void> {
    const sequences = new Set<number>()
    const plates = new Set<string>()
    const classIds = new Set<string>()
    for (const vehicle of input.vehicles) {
      validateVehicle(vehicle, sequences, plates)
      if (hasContactValue(vehicle) && !access.permissionKeys.has("sensitive_data.read")) {
        throw transportForbidden("staff identity cannot save transport contacts")
      }
      const occupancy = vehicleOccupancy(vehicle)
      if (occupancy > vehicle.seatCapacity) {
        throw malformedTransportInput(`车辆${vehicle.sequence}超载：容量${vehicle.seatCapacity}人，已安排${occupancy}人`)
      }
      const vehicleClassIds = new Set<string>()
      for (const allocation of vehicle.allocations) {
        validateAllocation(allocation)
        if (vehicleClassIds.has(allocation.classId)) {
          throw malformedTransportInput(`车辆${vehicle.sequence}中班级${allocation.classId}重复安排`)
        }
        vehicleClassIds.add(allocation.classId)
        this.staffAccess.assertTransportWriteScope(access, { ...sessionScope(session), requestedClassId: allocation.classId })
        classIds.add(allocation.classId)
      }
    }
    await this.ensureClassesBelongToSession(manager, session, classIds)
  }

  private async ensureClassesBelongToSession(
    manager: EntityManager,
    session: TourSessionEntity,
    classIds: ReadonlySet<string>,
  ): Promise<void> {
    if (classIds.size === 0) {
      return
    }
    const rows: readonly { readonly id: string; readonly className: string; readonly organizationId: string }[] = await manager
      .createQueryBuilder(SchoolClassEntity, "class")
      .innerJoin(SchoolGradeEntity, "grade", "grade.id = class.grade_id")
      .select("class.id", "id")
      .addSelect("class.name", "className")
      .addSelect("grade.organization_id", "organizationId")
      .where("class.id in (:...ids)", { ids: [...classIds] })
      .getRawMany()
    const byId = new Map(rows.map((row) => [row.id, row]))
    for (const classId of classIds) {
      const row = byId.get(classId)
      if (row === undefined || row.organizationId !== session.organizationId) {
        throw malformedTransportInput(`班级${classId}不属于当前团期学校`)
      }
    }
  }

	  private async loadPlan(manager: EntityManager, session: TourSessionEntity): Promise<TransportPlanResponse> {
	    const planVersion = await ensureTransportPlan(manager, session.id)
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

	  private async upsertVehicles(
	    manager: EntityManager,
	    session: TourSessionEntity,
	    actorId: string,
	    input: TransportPlanInput,
	  ): Promise<void> {
	    const existingRows: readonly VehicleRow[] = await manager.query(
	      "select id, sequence from transport_session_vehicles where tour_session_id = ? order by sequence",
	      [session.id],
	    )
	    const existingBySequence = new Map(existingRows.map((row) => [Number(row.sequence), row.id]))
	    const inputSequences = new Set(input.vehicles.map((vehicle) => vehicle.sequence))
	    for (const row of existingRows) {
	      if (!inputSequences.has(Number(row.sequence))) {
	        await this.deleteVehicleIfUnused(manager, session.id, row.id, Number(row.sequence))
	      }
	    }
	    for (const vehicle of input.vehicles) {
	      const vehicleId = existingBySequence.get(vehicle.sequence) ?? makeId("vehicle")
	      if (existingBySequence.has(vehicle.sequence)) {
	        await manager.update(TransportSessionVehicleEntity, { id: vehicleId }, {
	          seatCapacity: vehicle.seatCapacity,
	          plateNumber: textOrNull(vehicle.plateNumber),
	          contactSnapshotJson: vehicle.contactSnapshot,
	        })
	      } else {
	        await manager.save(TransportSessionVehicleEntity, {
	          id: vehicleId,
	          organizationId: session.organizationId,
	          tourSessionId: session.id,
	          sequence: vehicle.sequence,
	          seatCapacity: vehicle.seatCapacity,
	          plateNumber: textOrNull(vehicle.plateNumber),
	          contactSnapshotJson: vehicle.contactSnapshot,
	          createdBy: actorId,
	        })
	      }
	      await this.replaceClassAllocations(manager, vehicleId, vehicle)
	    }
	  }

	  private async deleteVehicleIfUnused(manager: EntityManager, tourSessionId: string, vehicleId: string, sequence: number): Promise<void> {
	    const [assignmentCount, confirmationCount] = await Promise.all([
	      this.countRows(manager, "select count(*) as count from transport_person_allocations where vehicle_id = ?", [vehicleId]),
	      this.countRows(manager, "select count(*) as count from transport_confirmations where tour_session_id = ?", [tourSessionId]),
	    ])
	    if (assignmentCount > 0 || confirmationCount > 0) {
	      throw transportConflict("vehicle_in_use", `${sequence}号车已有人员分配或历史确认，不能通过保存安排悄然删除。`)
	    }
	    await manager.delete(TransportClassAllocationEntity, { vehicleId })
	    await manager.delete(TransportSessionVehicleEntity, { id: vehicleId })
	  }

	  private async replaceClassAllocations(manager: EntityManager, vehicleId: string, vehicle: TransportVehicleInput): Promise<void> {
	    await manager.delete(TransportClassAllocationEntity, { vehicleId })
	    if (vehicle.allocations.length === 0) return
	    await manager.save(TransportClassAllocationEntity, vehicle.allocations.map((allocation) => ({
	      id: makeId("allocation"),
	      vehicleId,
	      classId: allocation.classId,
	      studentCount: allocation.studentCount,
	      guardianCount: allocation.guardianCount,
	      teacherCount: allocation.teacherCount,
	      otherCount: allocation.otherCount,
	      note: textOrNull(allocation.note),
	    })))
	  }

	  private async countRows(manager: EntityManager, sql: string, params: readonly string[]): Promise<number> {
	    const rows: readonly CountRow[] = await manager.query(sql, params)
	    return Number(rows[0]?.count ?? 0)
	  }
	}
