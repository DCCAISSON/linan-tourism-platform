import { BadRequestException } from "@nestjs/common"
import type { CatalogItemEntity, TourSessionEntity } from "../../domain/entities/index.js"
import type { TourSessionResponse } from "./configuration.types.js"

export function requireEnrollmentWindow(session: TourSessionEntity): TourSessionResponse {
  if (session.enrollmentOpensAt === null || session.enrollmentClosesAt === null) {
    throw new BadRequestException({
      code: "stale_state",
      message: "tour session enrollment window is not configured",
    })
  }

  return {
    id: session.id,
    organizationId: session.organizationId,
    catalogItemId: session.catalogItemId,
    code: session.code,
    status: session.status,
    priceFen: session.priceFen,
    capacity: session.capacity,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    enrollmentOpensAt: session.enrollmentOpensAt,
    enrollmentClosesAt: session.enrollmentClosesAt,
    policyVersion: session.policyVersion,
  }
}

export function ensureTourSessionDates(session: TourSessionEntity): void {
  if (session.endsAt.getTime() < session.startsAt.getTime()) {
    throw new BadRequestException({
      code: "malformed_input",
      message: "endsAt must not be earlier than startsAt",
    })
  }

  if (
    session.enrollmentOpensAt !== null &&
    session.enrollmentClosesAt !== null &&
    session.enrollmentClosesAt.getTime() < session.enrollmentOpensAt.getTime()
  ) {
    throw new BadRequestException({
      code: "malformed_input",
      message: "enrollmentClosesAt must not be earlier than enrollmentOpensAt",
    })
  }
}

export function ensureCatalogBelongsToSchool(
  item: CatalogItemEntity,
  organizationId: string,
): void {
  if (item.organizationId !== organizationId) {
    throw new BadRequestException({
      code: "organization_mismatch",
      message: "catalog item must belong to the tour session organization",
    })
  }
}
