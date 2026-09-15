import { BadRequestException, Inject, Injectable } from "@nestjs/common"
import { DOMAIN_POLICY_VERSION, TOUR_SESSION_STATUS } from "@linan/contracts"
import {
  CatalogItemEntity,
  OrganizationEntity,
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
} from "./configuration.tour-session.js"
import type {
  CatalogItemResponse,
  ClassResponse,
  EnrollmentAvailabilityResponse,
  GradeResponse,
  NewCatalogItem,
  NewClass,
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
    const item = await findCatalogItem(dataSource, id)
    if (input.code !== undefined) {
      item.code = input.code
    }
    if (input.title !== undefined) {
      item.title = input.title
    }
    if (input.status !== undefined) {
      item.status = input.status
    }
    try {
      return await dataSource.getRepository(CatalogItemEntity).save(item)
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
      const session = await dataSource.getRepository(TourSessionEntity).save({
        ...input,
        id: makeId("session"),
        policyVersion: DOMAIN_POLICY_VERSION,
      })
      return requireEnrollmentWindow(session)
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
    return sessions.map(requireEnrollmentWindow)
  }

  async updateTourSession(id: string, input: UpdateTourSession): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    const session = await findTourSessionEntity(dataSource, id)
    updateTourSessionEntity(session, input)
    ensureCatalogBelongsToSchool(await findCatalogItem(dataSource, session.catalogItemId), session.organizationId)
    ensureTourSessionDates(session)
    try {
      return requireEnrollmentWindow(await dataSource.getRepository(TourSessionEntity).save(session))
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

    return { available: true, tourSessionId: id, at: at.toISOString() }
  }

  private async findTourSession(id: string): Promise<TourSessionResponse> {
    const dataSource = await this.database.getDataSource()
    return requireEnrollmentWindow(await findTourSessionEntity(dataSource, id))
  }
}
