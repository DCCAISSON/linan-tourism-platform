import { randomUUID } from "node:crypto"
import type { DataSource, EntityTarget, ObjectLiteral } from "typeorm"
import {
  CatalogItemEntity,
  OrganizationEntity,
  SchoolClassEntity,
  SchoolGradeEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { notFound, throwWriteConflict } from "./configuration.errors.js"
import type { UpdateTourSession } from "./configuration.types.js"

type DeleteTarget<Entity extends ObjectLiteral> = {
  readonly entity: EntityTarget<Entity>
  readonly id: string
  readonly missingMessage: string
}

export function makeId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

export async function deleteById<Entity extends ObjectLiteral>(
  dataSource: DataSource,
  target: DeleteTarget<Entity>,
): Promise<void> {
  try {
    const result = await dataSource.getRepository(target.entity).delete(target.id)
    if (result.affected === 0) {
      throw notFound(target.missingMessage)
    }
  } catch (error) {
    throwWriteConflict(error)
  }
}

export async function findSchool(dataSource: DataSource, id: string): Promise<OrganizationEntity> {
  const school = await dataSource.getRepository(OrganizationEntity).findOneBy({ id })
  if (school === null) {
    throw notFound("school was not found")
  }
  return school
}

export async function findGrade(dataSource: DataSource, id: string): Promise<SchoolGradeEntity> {
  const grade = await dataSource.getRepository(SchoolGradeEntity).findOneBy({ id })
  if (grade === null) {
    throw notFound("grade was not found")
  }
  return grade
}

export async function findClass(dataSource: DataSource, id: string): Promise<SchoolClassEntity> {
  const schoolClass = await dataSource.getRepository(SchoolClassEntity).findOneBy({ id })
  if (schoolClass === null) {
    throw notFound("class was not found")
  }
  return schoolClass
}

export async function findCatalogItem(
  dataSource: DataSource,
  id: string,
): Promise<CatalogItemEntity> {
  const item = await dataSource.getRepository(CatalogItemEntity).findOneBy({ id })
  if (item === null) {
    throw notFound("catalog item was not found")
  }
  return item
}

export async function findTourSessionEntity(
  dataSource: DataSource,
  id: string,
): Promise<TourSessionEntity> {
  const session = await dataSource.getRepository(TourSessionEntity).findOneBy({ id })
  if (session === null) {
    throw notFound("tour session was not found")
  }
  return session
}

export function updateTourSessionEntity(
  session: TourSessionEntity,
  input: UpdateTourSession,
): void {
  if (input.catalogItemId !== undefined) {
    session.catalogItemId = input.catalogItemId
  }
  if (input.code !== undefined) {
    session.code = input.code
  }
  if (input.status !== undefined) {
    session.status = input.status
  }
  if (input.priceFen !== undefined) {
    session.priceFen = input.priceFen
  }
  if (input.capacity !== undefined) {
    session.capacity = input.capacity
  }
  if (input.minimumParticipants !== undefined) {
    session.minimumParticipants = input.minimumParticipants
  }
  if (input.startsAt !== undefined) {
    session.startsAt = input.startsAt
  }
  if (input.endsAt !== undefined) {
    session.endsAt = input.endsAt
  }
  if (input.enrollmentOpensAt !== undefined) {
    session.enrollmentOpensAt = input.enrollmentOpensAt
  }
  if (input.enrollmentClosesAt !== undefined) {
    session.enrollmentClosesAt = input.enrollmentClosesAt
  }
}
