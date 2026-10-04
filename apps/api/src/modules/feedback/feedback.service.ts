import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { CatalogItemEntity } from "../../domain/entities/catalog-item.entity.js"
import { OrganizationEntity } from "../../domain/entities/organization.entity.js"
import { ServiceFeedbackEntity } from "../../domain/entities/service-feedback.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { findScopedOrder } from "../order/order.persistence.js"
import { filterFeedback, publicFeedbackItems, summarizeFeedback } from "./feedback.policy.js"
import type { FeedbackFilters, FeedbackReviewInput, ServiceFeedbackInput, ServiceFeedbackRecord } from "./feedback.types.js"
import { buildFeedbackWorkbook } from "./feedback.workbook.js"

@Injectable()
export class FeedbackService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async submitFamily(identity: EnrollmentIdentity, input: ServiceFeedbackInput): Promise<{ readonly id: string; readonly status: "submitted"; readonly public: false }> {
    if (input.source !== "family" || input.orderId === null) throw new ForbiddenException({ code: "feedback_family_scope_required", message: "family feedback must use own order" })
    const orderId = input.orderId
    const db = await this.database.getDataSource()
    return db.transaction(async (manager) => {
      const { order, enrollment } = await findScopedOrder(manager, identity, orderId)
      if (enrollment.tourSessionId !== input.tourSessionId) throw new ForbiddenException({ code: "feedback_order_scope_mismatch", message: "order does not belong to this session" })
      const existing = await manager.findOneBy(ServiceFeedbackEntity, { tourSessionId: input.tourSessionId, source: "family", idempotencyKey: input.idempotencyKey })
      if (existing !== null) return { id: existing.id, status: "submitted", public: false }
      const session = await requireSession(manager, input.tourSessionId)
      const row = await manager.save(ServiceFeedbackEntity, {
        id: makeId("feedback"),
        tourSessionId: input.tourSessionId,
        organizationId: session.organizationId,
        orderId: order.id,
        source: "family",
        rating: input.rating,
        content: input.content,
        contactName: input.contactName,
        allowPublic: input.allowPublic,
        status: "submitted",
        publicExcerpt: "",
        idempotencyKey: input.idempotencyKey,
      })
      return { id: row.id, status: "submitted", public: false }
    })
  }

  async submitSchool(staff: StaffAccess, input: ServiceFeedbackInput): Promise<ServiceFeedbackRecord> {
    if (input.source !== "school") throw new ForbiddenException({ code: "feedback_school_source_required", message: "school feedback must use school source" })
    requirePermission(staff, "feedback.submit")
    const db = await this.database.getDataSource()
    return db.transaction(async (manager) => {
      const session = await requireSession(manager, input.tourSessionId)
      assertSchoolScope(staff, session.organizationId)
      const existing = await manager.findOneBy(ServiceFeedbackEntity, { tourSessionId: input.tourSessionId, source: "school", idempotencyKey: input.idempotencyKey })
      if (existing !== null) return toRecord(existing)
      return toRecord(await manager.save(ServiceFeedbackEntity, {
        id: makeId("feedback"),
        tourSessionId: input.tourSessionId,
        organizationId: session.organizationId,
        orderId: null,
        source: "school",
        rating: input.rating,
        content: input.content,
        contactName: input.contactName,
        allowPublic: input.allowPublic,
        status: "submitted",
        publicExcerpt: "",
        idempotencyKey: input.idempotencyKey,
      }))
    })
  }

  async sessions(staff: StaffAccess) {
    if (!staff.permissionKeys.has("feedback.submit")) requirePermission(staff, "feedback.read")
    const db = await this.database.getDataSource()
    const all = staff.scopes.some(scope => scope.kind === "all")
    const organizations = staff.scopes.flatMap(scope => (scope.kind === "organization" || scope.kind === "school") && scope.id !== null ? [scope.id] : [])
    if (!all && organizations.length === 0) return []
    const sessions = await db.manager.find(TourSessionEntity, { where: all ? {} : { organizationId: In(organizations) }, order: { startsAt: "DESC" } })
    if (sessions.length === 0) return []
    const schools = new Map((await db.manager.findBy(OrganizationEntity, { id: In(sessions.map(session => session.organizationId)) })).map(row => [row.id, row.name]))
    const courses = new Map((await db.manager.findBy(CatalogItemEntity, { id: In(sessions.map(session => session.catalogItemId)) })).map(row => [row.id, row.title]))
    return sessions.map(session => ({ id: session.id, name: `${courses.get(session.catalogItemId) ?? session.code} · ${session.code}`, schoolName: schools.get(session.organizationId) ?? "", startsAt: session.startsAt.toISOString() }))
  }

  async dashboard(staff: StaffAccess, tourSessionId: string, filters: FeedbackFilters = {}): Promise<{ readonly summary: ReturnType<typeof summarizeFeedback>; readonly items: readonly ServiceFeedbackRecord[] }> {
    requirePermission(staff, "feedback.read")
    const db = await this.database.getDataSource()
    const session = await requireSession(db.manager, tourSessionId)
    assertSchoolOrAllScope(staff, session.organizationId)
    const items = filterFeedback((await db.manager.find(ServiceFeedbackEntity, { where: { tourSessionId }, order: { createdAt: "DESC", id: "ASC" } })).map(toRecord), filters)
    return { summary: summarizeFeedback(items), items }
  }

  async exportWorkbook(staff: StaffAccess, tourSessionId: string, filters: FeedbackFilters): Promise<Buffer> {
    const { items } = await this.dashboard(staff, tourSessionId, filters)
    const db = await this.database.getDataSource()
    const session = await requireSession(db.manager, tourSessionId)
    const course = await db.manager.findOneBy(CatalogItemEntity, { id: session.catalogItemId })
    const school = await db.manager.findOneBy(OrganizationEntity, { id: session.organizationId })
    return buildFeedbackWorkbook({ sessionName: `${course?.title ?? session.code} · ${session.code} / ${school?.name ?? ""}`, filters, items })
  }

  async publicList(tourSessionId: string): Promise<ReturnType<typeof publicFeedbackItems>> {
    const db = await this.database.getDataSource()
    const items = (await db.manager.findBy(ServiceFeedbackEntity, { tourSessionId })).map(toRecord)
    return publicFeedbackItems(items)
  }

  async review(staff: StaffAccess, id: string, input: FeedbackReviewInput): Promise<ServiceFeedbackRecord> {
    requirePermission(staff, "feedback.review")
    const db = await this.database.getDataSource()
    return db.transaction(async (manager) => {
      const row = await manager.findOne(ServiceFeedbackEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
      if (row === null) throw new NotFoundException({ code: "feedback_not_found", message: "feedback not found" })
      assertSchoolOrAllScope(staff, row.organizationId)
      if (row.version !== input.expectedVersion) throw new ConflictException({ code: "feedback_stale", message: "feedback changed, refresh before retrying" })
      if (input.status === "published" && (!row.allowPublic || input.publicExcerpt.length === 0)) {
        throw new ConflictException({ code: "feedback_public_not_allowed", message: "public feedback requires explicit consent and reviewed excerpt" })
      }
      row.status = input.status
      row.publicExcerpt = input.status === "published" ? input.publicExcerpt : ""
      row.reviewedByStaffId = staff.actorId
      row.reviewedAt = new Date()
      row.version += 1
      return toRecord(await manager.save(row))
    })
  }
}

async function requireSession(manager: EntityManager, id: string): Promise<TourSessionEntity> {
  const session = await manager.findOneBy(TourSessionEntity, { id })
  if (session === null) throw new NotFoundException({ code: "tour_session_not_found", message: "session not found" })
  return session
}

function requirePermission(staff: StaffAccess, key: string): void {
  if (!new Set<string>(staff.permissionKeys).has(key)) throw new ForbiddenException({ code: "feedback_forbidden", message: "feedback access forbidden" })
}

function assertSchoolScope(staff: StaffAccess, organizationId: string): void {
  if (!staff.scopes.some((scope) => (scope.kind === "organization" || scope.kind === "school") && scope.id === organizationId)) {
    throw new ForbiddenException({ code: "feedback_school_scope_forbidden", message: "school feedback scope forbidden" })
  }
}

function assertSchoolOrAllScope(staff: StaffAccess, organizationId: string): void {
  if (!staff.scopes.some((scope) => scope.kind === "all" || ((scope.kind === "organization" || scope.kind === "school") && scope.id === organizationId))) {
    throw new ForbiddenException({ code: "feedback_scope_forbidden", message: "feedback scope forbidden" })
  }
}

function toRecord(row: ServiceFeedbackEntity): ServiceFeedbackRecord {
  return {
    id: row.id,
    tourSessionId: row.tourSessionId,
    organizationId: row.organizationId,
    source: row.source,
    rating: row.rating,
    content: row.content,
    allowPublic: row.allowPublic,
    status: row.status,
    publicExcerpt: row.publicExcerpt,
    version: row.version,
  }
}
