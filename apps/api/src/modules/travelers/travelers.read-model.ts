import { ConflictException, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { buildTravelerSnapshot } from "./travelers.merge.js"
import { loadTravelerSources } from "./travelers.sources.js"
import type { InternalTravelerSnapshot, PersonRef, TravelerDto, TravelerRecord } from "./travelers.types.js"

export async function readTravelers(manager: EntityManager, tourSessionId: string): Promise<InternalTravelerSnapshot> {
  return readScopedTravelers(manager, { tourSessionId, classId: null })
}

export async function readScopedTravelers(manager: EntityManager, scope: { readonly tourSessionId: string; readonly classId: string | null }): Promise<InternalTravelerSnapshot> {
  const session = await manager.findOneBy(TourSessionEntity, { id: scope.tourSessionId })
  if (session === null) throw new NotFoundException({ code: "tour_session_not_found", message: "团期不存在" })
  return buildTravelerSnapshot(session, await loadTravelerSources(manager, scope))
}

export function resolveTraveler(snapshot: InternalTravelerSnapshot, personRef: PersonRef): TravelerRecord {
  const source = snapshot.sources.find((candidate) => candidate.personRef === personRef && candidate.tourSessionId === snapshot.tourSessionId)
  if (source === undefined) throw new NotFoundException({ code: "traveler_not_found", message: "该团期未找到此人员来源" })
  return source
}

export function assertTravelerActionable(traveler: TravelerRecord): void {
  if (!traveler.active || traveler.conflict !== null) {
    throw new ConflictException({ code: traveler.conflict?.code ?? "traveler_inactive", message: "人员已取消、资格待确认或来源冲突，请先核对名单" })
  }
}

export function toTravelerDto(source: TravelerRecord): TravelerDto {
  return {
    personRef: source.personRef, sourceRefs: source.sourceRefs, source: source.source,
    tourSessionId: source.tourSessionId, organizationId: source.organizationId, displayName: source.displayName,
    gradeId: source.gradeId, classId: source.classId, gradeName: source.gradeName, className: source.className,
    participantKind: source.participantKind, importedRole: source.importedRole,
    identityMasked: source.identityMasked, phoneMasked: source.phoneMasked, active: source.active,
    inactiveReason: source.inactiveReason, eligibility: source.eligibility, eligibilityReason: source.eligibilityReason,
    importVersion: source.importVersion, conflict: source.conflict,
  }
}
