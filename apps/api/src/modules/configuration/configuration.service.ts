import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { DOMAIN_POLICY_VERSION, ORDER_STATUS, ROSTER_STATUS, TOUR_SESSION_STATUS } from "@linan/contracts"
import { In } from "typeorm"
import { ensureScopeHierarchy, lockTourSession } from "./configuration.scope.js"
import type { EnrollmentScope } from "./configuration.scope.js"
import {
  CatalogItemEntity,
  NoticeVersionEntity,
  OrderEntity,
  OrganizationEntity,
  RosterEntryEntity,
  SchoolClassEntity,
  SchoolGradeEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "./configuration-database.service.js"
import { throwWriteConflict } from "./configuration.errors.js"
import {
  deleteById,
  findCatalogItem,
  findClass,
  findGrade,
  findSchool,
  findTourSessionEntity,
  makeId,
  updateTourSessionEntity,
} from "./configuration.persistence.js"
import {
  ensureCatalogBelongsToSchool,
  ensureTourSessionDates,
  requireEnrollmentWindow,
  toNoticeVersionResponse,
} from "./configuration.tour-session.js"
import type {
  CatalogItemResponse,
  ClassResponse,
  EnrollmentAvailabilityResponse,
  GradeResponse,
  NewCatalogItem,
  NewClass,
  NewNoticeVersion,
  NoticeVersionResponse,
  NewGrade,
  NewSchool,
  NewTourSession,
  SchoolResponse,
  TourSessionResponse,
  UpdateCatalogItem,
  UpdateClass,
  UpdateGrade,
  UpdateSchool,
  UpdateTourSession,
} from "./configuration.types.js"

@Injectable()
export class ConfigurationService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async createSchool(input: NewSchool): Promise<SchoolResponse> {
    const dataSource = await this.database.getDataSource()
    try {
      return await dataSource.getRepository(OrganizationEntity).save({ ...input, id: makeId("school") })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async listSchools(): Promise<readonly SchoolResponse[]> {
    const dataSource = await this.database.getDataSource()
    return dataSource.getRepository(OrganizationEntity).find({ order: { code: "ASC" } })
  }

  async updateSchool(id: string, input: UpdateSchool): Promise<SchoolResponse> {
    const dataSource = await this.database.getDataSource()
    const school = await findSchool(dataSource, id)
    if (input.code !== undefined) {
      school.code = input.code
    }
    if (input.name !== undefined) {
      school.name = input.name
    }
    try {
      return await dataSource.getRepository(OrganizationEntity).save(school)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async deleteSchool(id: string): Promise<void> {
    await deleteById(await this.database.getDataSource(), { entity: OrganizationEntity, id, missingMessage: "school was not found" })
  }

  async createGrade(input: NewGrade): Promise<GradeResponse> {
    const dataSource = await this.database.getDataSource()
    await findSchool(dataSource, input.organizationId)
    try {
      return await dataSource.getRepository(SchoolGradeEntity).save({ ...input, id: makeId("grade") })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async listGrades(schoolId: string): Promise<readonly GradeResponse[]> {
    const dataSource = await this.database.getDataSource()
    await findSchool(dataSource, schoolId)
    return dataSource
      .getRepository(SchoolGradeEntity)
      .find({ where: { organizationId: schoolId }, order: { code: "ASC" } })
  }

  async updateGrade(id: string, input: UpdateGrade): Promise<GradeResponse> {
    const dataSource = await this.database.getDataSource()
    const grade = await findGrade(dataSource, id)
    if (input.code !== undefined) {
      grade.code = input.code
    }
    if (input.name !== undefined) {
      grade.name = input.name
    }
    try {
      return await dataSource.getRepository(SchoolGradeEntity).save(grade)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async deleteGrade(id: string): Promise<void> {
    await deleteById(await this.database.getDataSource(), { entity: SchoolGradeEntity, id, missingMessage: "grade was not found" })
  }

  async createClass(input: NewClass): Promise<ClassResponse> {
    const dataSource = await this.database.getDataSource()
    await findGrade(dataSource, input.gradeId)
    try {
      return await dataSource.getRepository(SchoolClassEntity).save({ ...input, id: makeId("class") })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async listClasses(gradeId: string): Promise<readonly ClassResponse[]> {
    const dataSource = await this.database.getDataSource()
    await findGrade(dataSource, gradeId)
    return dataSource.getRepository(SchoolClassEntity).find({ where: { gradeId }, order: { code: "ASC" } })
  }

  async updateClass(id: string, input: UpdateClass): Promise<ClassResponse> {
    const dataSource = await this.database.getDataSource()
    const schoolClass = await findClass(dataSource, id)
    if (input.code !== undefined) {
      schoolClass.code = input.code
    }
    if (input.name !== undefined) {
      schoolClass.name = input.name
    }
    try {
      return await dataSource.getRepository(SchoolClassEntity).save(schoolClass)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async deleteClass(id: string): Promise<void> {
    await deleteById(await this.database.getDataSource(), { entity: SchoolClassEntity, id, missingMessage: "class was not found" })
  }

  async createCatalogItem(input: NewCatalogItem): Promise<CatalogItemResponse> {
    const dataSource = await this.database.getDataSource()
    await findSchool(dataSource, input.organizationId)
    try {
      return await dataSource.getRepository(CatalogItemEntity).save({
        ...input,
        id: makeId("catalog"),
        policyVersion: DOMAIN_POLICY_VERSION,
      })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async listCatalogItems(): Promise<readonly CatalogItemResponse[]> {
    const dataSource = await this.database.getDataSource()
    return dataSource.getRepository(CatalogItemEntity).find({ order: { code: "ASC" } })
  }

  async updateCatalogItem(id: string, input: UpdateCatalogItem): Promise<CatalogItemResponse> {
    const dataSource = await this.database.getDataSource()
    try {
      return await dataSource.transaction(async manager => {
        const item = await manager.findOne(CatalogItemEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
        if (item === null) throw new NotFoundException({ code: "not_found", message: "学校课程不存在" })
        if (item.templateId !== null && (input.title !== undefined || input.description !== undefined || input.coverImageUrl !== undefined)) {
          throw new ConflictException({ code: "catalog_template_linked", message: "该课程使用共享模板，请编辑模板或先解除关联" })
        }
        if (input.code !== undefined) item.code = input.code
        if (input.title !== undefined) item.title = input.title
        if (input.description !== undefined) item.description = input.description
        if (input.coverImageUrl !== undefined) item.coverImageUrl = input.coverImageUrl
        if (input.status !== undefined) item.status = input.status
        return manager.save(item)
      })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async deleteCatalogItem(id: string): Promise<void> {
    await deleteById(await this.database.getDataSource(), { entity: CatalogItemEntity, id, missingMessage: "catalog item was not found" })
  }

  async createTourSession(input: NewTourSession): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    await findSchool(dataSource, input.organizationId)
    ensureCatalogBelongsToSchool(await findCatalogItem(dataSource, input.catalogItemId), input.organizationId)
    try {
      const session = await dataSource.transaction(async (manager) => {
        const enrollmentScopeJson = input.enrollmentScope ?? null
        await ensureScopeHierarchy(manager, { organizationId: input.organizationId, enrollmentScopeJson })
        return manager.save(TourSessionEntity, {
        ...input,
        enrollmentScopeJson,
        minimumParticipants: input.minimumParticipants ?? null,
        id: makeId("session"),
        policyVersion: DOMAIN_POLICY_VERSION,
        })
      })
      return requireEnrollmentWindow(session, null, 0)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async listTourSessions(): Promise<readonly TourSessionResponse[]> {
    const dataSource = await this.database.getDataSource()
    const sessions = await dataSource
      .getRepository(TourSessionEntity)
      .createQueryBuilder("tour_session")
      .where("tour_session.enrollment_opens_at is not null")
      .andWhere("tour_session.enrollment_closes_at is not null")
      .orderBy("tour_session.code", "ASC")
      .getMany()
    const activeNotices = await this.findActiveNoticeMap(sessions)
    return Promise.all(sessions.map(async (session) => requireEnrollmentWindow(
      session, activeNotices.get(session.activeNoticeId ?? "") ?? null, await this.countPaidParticipants(session.id),
    )))
  }

  async createNoticeVersion(tourSessionId: string, input: NewNoticeVersion): Promise<NoticeVersionResponse> {
    const dataSource = await this.database.getDataSource()
    const session = await findTourSessionEntity(dataSource, tourSessionId)
    try {
      const notice = await dataSource.getRepository(NoticeVersionEntity).save({
        id: makeId("notice"),
        organizationId: session.organizationId,
        tourSessionId: session.id,
        version: input.version,
        title: input.title,
        contentJson: input.contentJson,
      })
      return toNoticeVersionResponse(notice)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async listNoticeVersions(tourSessionId: string): Promise<readonly NoticeVersionResponse[]> {
    const dataSource = await this.database.getDataSource()
    await findTourSessionEntity(dataSource, tourSessionId)
    const notices = await dataSource.getRepository(NoticeVersionEntity).find({
      where: { tourSessionId },
      order: { createdAt: "DESC" },
    })
    return notices.map(toNoticeVersionResponse)
  }

  async activateNoticeVersion(tourSessionId: string, noticeVersionId: string): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    try {
      return await dataSource.transaction(async (manager) => {
        const session = await lockTourSession(manager, tourSessionId)
        const notice = await manager.findOneBy(NoticeVersionEntity, { id: noticeVersionId })
        if (notice === null || notice.tourSessionId !== session.id || notice.organizationId !== session.organizationId) {
          throw new BadRequestException({ code: "not_found", message: "notice version was not found" })
        }
        session.activeNoticeId = notice.id
        await manager.save(TourSessionEntity, session)
        return requireEnrollmentWindow(session, notice, await this.countPaidParticipants(session.id))
      })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async updateTourSession(id: string, input: UpdateTourSession): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    try {
      const saved = await dataSource.transaction(async (manager) => {
        const session = await lockTourSession(manager, id)
        updateTourSessionEntity(session, input)
        ensureCatalogBelongsToSchool(await findCatalogItem(dataSource, session.catalogItemId), session.organizationId)
        ensureTourSessionDates(session)
        if (input.enrollmentScope !== undefined) await ensureScopeHierarchy(manager, session)
        return manager.save(TourSessionEntity, session)
      })
      return this.withActiveNotice(saved)
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async deleteTourSession(id: string): Promise<void> {
    await deleteById(await this.database.getDataSource(), { entity: TourSessionEntity, id, missingMessage: "tour session was not found" })
  }

  async checkEnrollmentAvailability(id: string, at: Date): Promise<EnrollmentAvailabilityResponse> {
    const session = await this.findTourSession(id)
    if (session.status !== TOUR_SESSION_STATUS.published) {
      throw new BadRequestException({ code: "stale_state", message: "tour session is not open for enrollment" })
    }

    const checkedAt = at.getTime()
    if (
      checkedAt < session.enrollmentOpensAt.getTime() ||
      checkedAt > session.enrollmentClosesAt.getTime()
    ) {
      throw new BadRequestException({ code: "stale_state", message: "tour session is outside enrollment window" })
    }

    const occupiedCapacity = await this.countPaidParticipants(id)
    const capacity = { capacity: session.capacity, occupiedCapacity, remainingCapacity: Math.max(0, session.capacity - occupiedCapacity) }
    if (capacity.remainingCapacity === 0) {
      throw new BadRequestException({ code: "stale_state", message: "tour session is full", ...capacity })
    }
    return { available: true, tourSessionId: id, at: at.toISOString(), ...capacity }
  }

  private async findTourSession(id: string): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    return this.withActiveNotice(await findTourSessionEntity(dataSource, id))
  }

  private async withActiveNotice(session: TourSessionEntity): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    const occupiedCapacity = await this.countPaidParticipants(session.id)
    if (session.activeNoticeId === null) {
      return requireEnrollmentWindow(session, null, occupiedCapacity)
    }
    const notice = await dataSource.getRepository(NoticeVersionEntity).findOneBy({ id: session.activeNoticeId })
    return requireEnrollmentWindow(session, notice, occupiedCapacity)
  }

  async updateEnrollmentScope(id: string, enrollmentScope: EnrollmentScope): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    const saved = await dataSource.transaction(async (manager) => {
      const session = await lockTourSession(manager, id)
      session.enrollmentScopeJson = enrollmentScope
      await ensureScopeHierarchy(manager, session)
      return manager.save(TourSessionEntity, session)
    })
    return this.withActiveNotice(saved)
  }

  private async countPaidParticipants(id: string): Promise<number> {
    const dataSource = await this.database.getDataSource()
    return dataSource.getRepository(RosterEntryEntity).createQueryBuilder("roster")
      .innerJoin(OrderEntity, "paid_order", "paid_order.enrollment_id = roster.enrollment_id and paid_order.status = :paid", { paid: ORDER_STATUS.paid })
      .where("roster.tour_session_id = :id", { id })
      .andWhere("roster.status != :cancelled", { cancelled: ROSTER_STATUS.cancelled })
      .getCount()
  }

  private async findActiveNoticeMap(sessions: readonly TourSessionEntity[]): Promise<ReadonlyMap<string, NoticeVersionEntity>> {
    const ids = [...new Set(sessions.map((session) => session.activeNoticeId).filter((id): id is string => id !== null))]
    if (ids.length === 0) {
      return new Map()
    }
    const dataSource = await this.database.getDataSource()
    const notices = await dataSource.getRepository(NoticeVersionEntity).findBy({ id: In(ids) })
    return new Map(notices.map((notice) => [notice.id, notice]))
  }
}
