import { randomUUID } from "node:crypto"
import { ConflictException, GoneException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { AuditLogEntity } from "../../domain/entities/audit-log.entity.js"
import { OrderLineEntity } from "../../domain/entities/order-line.entity.js"
import { PretripAdjustmentRequestEntity } from "../../domain/entities/pretrip-adjustment-request.entity.js"
import { PretripAttachmentEntity } from "../../domain/entities/pretrip-attachment.entity.js"
import { PretripConfigEntity } from "../../domain/entities/pretrip-config.entity.js"
import { PretripSchoolConfirmationEntity } from "../../domain/entities/pretrip-school-confirmation.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { findScopedOrder } from "../order/order.persistence.js"
import { assertTravelerActionable, readTravelers, resolveTraveler } from "../travelers/travelers.read-model.js"
import type { PersonRef, TravelerRecord } from "../travelers/travelers.types.js"
import { readTransportConfirmation } from "../transport/transport-confirmation.read.js"
import type {
  AttachmentUrlResponse,
  FamilyPretripPerson,
  FamilyPretripResponse,
  PretripAdjustmentInput,
  PretripAdjustmentProcessInput,
  PretripAdjustmentResponse,
  PretripAttachmentResponse,
  PretripConfigInput,
  PretripConfigResponse,
  SchoolPretripConfirmationResponse,
} from "./pretrip.types.js"

type TransportState = {
  readonly status: "unconfirmed" | "current" | "stale"
  readonly confirmationId: string | null
  readonly planVersion: number
  readonly rosterVersion: string
  readonly snapshot: TransportSnapshot | null
}

type TransportSnapshot = {
  readonly vehicles: readonly SnapshotVehicle[]
  readonly assignments: readonly SnapshotAssignment[]
}

type SnapshotVehicle = {
  readonly id: string
  readonly sequence: number
  readonly plateNumber: string
  readonly guideName: string | null
  readonly guidePhone: string | null
  readonly driverName: string | null
  readonly driverPhone: string | null
  readonly teacherName: string | null
  readonly teacherPhone: string | null
}

type SnapshotAssignment = {
  readonly personRef: string
  readonly vehicleId: string
}

@Injectable()
export class PretripService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  async readStaffConfig(access: StaffAccess, tourSessionId: string): Promise<PretripConfigResponse> {
    const manager = (await this.database.getDataSource()).manager
    const session = await requireSession(manager, tourSessionId)
    this.staffAccess.assertPretripManageScope(access, sessionScope(session))
    return this.configResponse(manager, session.id)
  }

  async saveStaffConfig(access: StaffAccess, tourSessionId: string, input: PretripConfigInput): Promise<PretripConfigResponse> {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await requireSession(manager, tourSessionId)
      this.staffAccess.assertPretripManageScope(access, sessionScope(session))
      const current = await manager.findOne(PretripConfigEntity, { where: { tourSessionId: session.id }, lock: { mode: "pessimistic_write" } })
      if ((current?.version ?? 0) !== input.expectedVersion) throw stale("pretrip configuration has changed")
      const row = current ?? manager.create(PretripConfigEntity, { tourSessionId: session.id, version: 0 })
      Object.assign(row, {
        gatheringAt: input.gatheringAt === null ? null : new Date(input.gatheringAt),
        gatheringPlace: input.gatheringPlace,
        travelMode: input.travelMode,
        itineraryNote: input.itineraryNote,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        serviceContact: input.serviceContact,
        noticeVersionId: input.noticeVersionId,
        updatedByStaffId: access.actorId,
        version: row.version + 1,
      })
      await manager.save(row)
      await manager.delete(PretripAttachmentEntity, { tourSessionId: session.id })
      if (input.attachments.length > 0) {
        await manager.save(input.attachments.map((attachment) => manager.create(PretripAttachmentEntity, {
          id: attachment.id ?? randomUUID(),
          tourSessionId: session.id,
          title: attachment.title,
          objectKey: attachment.objectKey,
          contentType: attachment.contentType,
          byteSize: attachment.byteSize,
          createdByStaffId: access.actorId,
        })))
      }
      await audit(manager, session, access.actorId, "pretrip.config.saved", session.id)
      return this.configResponse(manager, session.id)
    })
  }

  async familyPretrip(identity: EnrollmentIdentity, orderId: string): Promise<FamilyPretripResponse> {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    const transport = await this.transportState(manager, scoped.enrollment.tourSessionId)
    const lines = await manager.findBy(OrderLineEntity, { orderId: scoped.order.id })
    return {
      orderId: scoped.order.id,
      tourSessionId: scoped.enrollment.tourSessionId,
      config: await this.optionalConfigResponse(manager, scoped.enrollment.tourSessionId),
      transportStatus: transport.status,
      persons: lines.map((line) => familyPerson(line, transport)),
    }
  }

  async attachmentUrl(identity: EnrollmentIdentity, orderId: string, attachmentId: string): Promise<AttachmentUrlResponse> {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    const attachment = await manager.findOneBy(PretripAttachmentEntity, { id: attachmentId, tourSessionId: scoped.enrollment.tourSessionId })
    if (attachment === null) throw missing("pretrip attachment not found")
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    return { expiresAt, url: `/orders/${encodeURIComponent(orderId)}/pretrip/attachments/${encodeURIComponent(attachment.id)}/download?expiresAt=${encodeURIComponent(expiresAt)}` }
  }

  async downloadAttachment(identity: EnrollmentIdentity, orderId: string, attachmentId: string, expiresAt: string): Promise<PretripAttachmentResponse> {
    const expires = Date.parse(expiresAt)
    if (!Number.isFinite(expires) || expires < Date.now()) throw expired("pretrip attachment link has expired")
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    const attachment = await manager.findOneBy(PretripAttachmentEntity, { id: attachmentId, tourSessionId: scoped.enrollment.tourSessionId })
    if (attachment === null) throw missing("pretrip attachment not found")
    return toAttachment(attachment)
  }

  async schoolConfirm(access: StaffAccess, tourSessionId: string): Promise<SchoolPretripConfirmationResponse> {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await requireSession(manager, tourSessionId)
      this.staffAccess.assertPretripSchoolConfirmScope(access, sessionScope(session))
      const transport = await this.currentTransport(manager, session.id)
      await manager.update(PretripSchoolConfirmationEntity, { tourSessionId: session.id, schoolId: session.organizationId, status: "current" }, { status: "superseded" })
      const row = manager.create(PretripSchoolConfirmationEntity, {
        id: randomUUID(),
        tourSessionId: session.id,
        schoolId: session.organizationId,
        transportConfirmationId: transport.confirmationId,
        planVersion: transport.planVersion,
        rosterVersion: transport.rosterVersion,
        signedByStaffId: access.actorId,
      })
      await manager.save(row)
      await audit(manager, session, access.actorId, "pretrip.school.confirmed", row.id)
      return toSchoolConfirmation(row, "current")
    })
  }

  async schoolAdjust(access: StaffAccess, tourSessionId: string, input: PretripAdjustmentInput): Promise<PretripAdjustmentResponse> {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await requireSession(manager, tourSessionId)
      this.staffAccess.assertPretripSchoolConfirmScope(access, sessionScope(session))
      const transport = await this.currentTransport(manager, session.id)
      await verifySchoolAdjustmentPersonRef(manager, session, input.personRef)
      const row = manager.create(PretripAdjustmentRequestEntity, {
        id: randomUUID(),
        tourSessionId: session.id,
        schoolId: session.organizationId,
        transportConfirmationId: transport.confirmationId,
        planVersion: transport.planVersion,
        rosterVersion: transport.rosterVersion,
        kind: input.kind,
        personRef: input.personRef,
        requestText: input.requestText,
        requestedByStaffId: access.actorId,
      })
      await manager.save(row)
      await audit(manager, session, access.actorId, "pretrip.adjustment.submitted", row.id)
      return toAdjustment(row)
    })
  }

  async processAdjustment(access: StaffAccess, requestId: string, input: PretripAdjustmentProcessInput): Promise<PretripAdjustmentResponse> {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const row = await manager.findOne(PretripAdjustmentRequestEntity, { where: { id: requestId }, lock: { mode: "pessimistic_write" } })
      if (row === null) throw missing("pretrip adjustment request not found")
      const session = await requireSession(manager, row.tourSessionId)
      this.staffAccess.assertPretripManageScope(access, sessionScope(session))
      if (row.status !== "submitted") throw stale("pretrip adjustment request has been processed")
      row.status = input.decision
      row.responseText = input.responseText
      row.processedByStaffId = access.actorId
      await manager.save(row)
      await manager.update(PretripSchoolConfirmationEntity, { tourSessionId: row.tourSessionId, schoolId: row.schoolId, status: "current" }, { status: "superseded" })
      await audit(manager, session, access.actorId, "pretrip.adjustment.processed", row.id)
      return toAdjustment(row)
    })
  }

  async schoolConfirmations(access: StaffAccess, tourSessionId: string): Promise<readonly SchoolPretripConfirmationResponse[]> {
    const manager = (await this.database.getDataSource()).manager
    const session = await requireSession(manager, tourSessionId)
    this.staffAccess.assertPretripManageScope(access, sessionScope(session))
    const transport = await this.transportState(manager, session.id)
    const rows = await manager.find(PretripSchoolConfirmationEntity, { where: { tourSessionId: session.id }, order: { signedAt: "DESC" } })
    return rows.map((row) => toSchoolConfirmation(row, row.status === "current" && (row.transportConfirmationId !== transport.confirmationId || transport.status !== "current") ? "stale" : row.status))
  }

  private async currentTransport(manager: EntityManager, tourSessionId: string): Promise<TransportState & { readonly status: "current"; readonly confirmationId: string }> {
    const state = await this.transportState(manager, tourSessionId)
    if (state.status !== "current" || state.confirmationId === null) throw stale("transport plan is not currently confirmed")
    return { ...state, status: "current", confirmationId: state.confirmationId }
  }

  private async transportState(manager: EntityManager, tourSessionId: string): Promise<TransportState> {
    return readTransportConfirmation(manager, tourSessionId)
  }

  private async configResponse(manager: EntityManager, tourSessionId: string): Promise<PretripConfigResponse> {
    return toConfigResponse(await findOrDefaultConfig(manager, tourSessionId), await attachments(manager, tourSessionId))
  }

  private async optionalConfigResponse(manager: EntityManager, tourSessionId: string): Promise<PretripConfigResponse | null> {
    const row = await manager.findOneBy(PretripConfigEntity, { tourSessionId })
    return row === null ? null : toConfigResponse(row, await attachments(manager, tourSessionId))
  }
}

async function findOrDefaultConfig(manager: EntityManager, tourSessionId: string): Promise<PretripConfigEntity> {
  const row = await manager.findOneBy(PretripConfigEntity, { tourSessionId })
  return row ?? manager.create(PretripConfigEntity, { tourSessionId, version: 0 })
}

async function attachments(manager: EntityManager, tourSessionId: string): Promise<readonly PretripAttachmentResponse[]> {
  return (await manager.find(PretripAttachmentEntity, { where: { tourSessionId }, order: { createdAt: "ASC" } })).map(toAttachment)
}

async function requireSession(manager: EntityManager, tourSessionId: string): Promise<TourSessionEntity> {
  const session = await manager.findOneBy(TourSessionEntity, { id: tourSessionId })
  if (session === null) throw missing("tour session not found")
  return session
}

function sessionScope(session: TourSessionEntity) {
  return { schoolId: session.organizationId, requestedSchoolId: session.organizationId, requestedClassId: null, tourSessionId: session.id }
}

async function verifySchoolAdjustmentPersonRef(manager: EntityManager, session: TourSessionEntity, personRef: PersonRef | null): Promise<void> {
  if (personRef === null) return
  const snapshot = await readTravelers(manager, session.id)
  assertSchoolAdjustmentTraveler(session, resolveTraveler(snapshot, personRef))
}

export function assertSchoolAdjustmentTraveler(session: Pick<TourSessionEntity, "id" | "organizationId">, traveler: Pick<TravelerRecord, "active" | "conflict" | "organizationId" | "tourSessionId">): void {
  if (traveler.tourSessionId !== session.id || traveler.organizationId !== session.organizationId) {
    throw policyConflict("pretrip_person_scope_mismatch", "adjustment person is outside this school session")
  }
  assertTravelerActionable(traveler as TravelerRecord)
}

function familyPerson(line: OrderLineEntity, transport: TransportState): FamilyPretripPerson {
  const base = { orderLineId: line.id, displayName: line.displayNameSnapshot }
  if (transport.status !== "current" || transport.snapshot === null) return { ...base, vehicleStatus: transport.status === "stale" ? "stale" : "unconfirmed", vehicle: null }
  const personRef = `paid:${line.id}`
  const assignment = transport.snapshot.assignments.find((candidate) => candidate.personRef === personRef)
  if (assignment === undefined) return { ...base, vehicleStatus: "unassigned", vehicle: null }
  const vehicle = transport.snapshot.vehicles.find((candidate) => candidate.id === assignment.vehicleId)
  if (vehicle === undefined) return { ...base, vehicleStatus: "unassigned", vehicle: null }
  return { ...base, vehicleStatus: "assigned", vehicle: { sequence: vehicle.sequence, plateNumber: vehicle.plateNumber, guideName: vehicle.guideName, guidePhone: vehicle.guidePhone, driverName: vehicle.driverName, driverPhone: vehicle.driverPhone, teacherName: vehicle.teacherName, teacherPhone: vehicle.teacherPhone } }
}

export function parseTransportSnapshot(value: unknown): TransportSnapshot {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value
  const root = readObject(parsed)
  return {
    vehicles: readArray(root["vehicles"]).map((item) => {
      const vehicle = readObject(item)
      const contact = readObject(vehicle["contact"] ?? vehicle["contactSnapshot"] ?? {})
      return {
        id: readString(vehicle["id"]),
        sequence: readNumber(vehicle["sequence"]),
        plateNumber: readOptionalString(vehicle["plateNumber"]) ?? "",
        guideName: readOptionalString(contact["guideName"]),
        guidePhone: readOptionalString(contact["guidePhone"]),
        driverName: readOptionalString(contact["driverName"]),
        driverPhone: readOptionalString(contact["driverPhone"]),
        teacherName: readOptionalString(contact["teacherName"]),
        teacherPhone: readOptionalString(contact["teacherPhone"]),
      }
    }),
    assignments: readArray(root["assignments"]).map((item) => {
      const assignment = readObject(item)
      return { personRef: readString(assignment["personRef"]), vehicleId: readString(assignment["vehicleId"]) }
    }),
  }
}

function toConfigResponse(row: PretripConfigEntity, attachmentRows: readonly PretripAttachmentResponse[]): PretripConfigResponse {
  return {
    tourSessionId: row.tourSessionId,
    gatheringAt: row.gatheringAt?.toISOString() ?? null,
    gatheringPlace: row.gatheringPlace,
    travelMode: row.travelMode,
    itineraryNote: row.itineraryNote,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    serviceContact: row.serviceContact,
    noticeVersionId: row.noticeVersionId,
    version: row.version,
    attachments: attachmentRows,
  }
}

function toAttachment(row: PretripAttachmentEntity): PretripAttachmentResponse {
  return { id: row.id, title: row.title, contentType: row.contentType, byteSize: row.byteSize }
}

function toSchoolConfirmation(row: PretripSchoolConfirmationEntity, status: SchoolPretripConfirmationResponse["status"]): SchoolPretripConfirmationResponse {
  return { id: row.id, tourSessionId: row.tourSessionId, schoolId: row.schoolId, transportConfirmationId: row.transportConfirmationId, planVersion: row.planVersion, rosterVersion: row.rosterVersion, status, signedAt: row.signedAt.toISOString(), signedByStaffId: row.signedByStaffId }
}

function toAdjustment(row: PretripAdjustmentRequestEntity): PretripAdjustmentResponse {
  return { id: row.id, tourSessionId: row.tourSessionId, schoolId: row.schoolId, transportConfirmationId: row.transportConfirmationId, planVersion: row.planVersion, rosterVersion: row.rosterVersion, kind: row.kind, personRef: row.personRef, requestText: row.requestText, status: row.status, responseText: row.responseText, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

async function audit(manager: EntityManager, session: TourSessionEntity, actorId: string, action: string, targetId: string): Promise<void> {
  await manager.save(manager.create(AuditLogEntity, { id: randomUUID(), organizationId: session.organizationId, actorId, action, targetType: "pretrip", targetId }))
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0
}

function stale(message: string): ConflictException {
  return new ConflictException({ code: "pretrip_stale", message })
}

function missing(message: string): NotFoundException {
  return new NotFoundException({ code: "pretrip_not_found", message })
}

function expired(message: string): GoneException {
  return new GoneException({ code: "pretrip_attachment_url_expired", message })
}

function policyConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message })
}
