import { ForbiddenException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import type { TravelerSource } from "./travelers.types.js"

type SourceRow = Omit<TravelerSource, "personRef" | "source" | "active" | "inactiveReason" | "eligibility" | "eligibilityReason" | "importVersion"> & {
  readonly id: string
  readonly orderStatus: string | null
  readonly rosterStatus: string | null
  readonly importStatus: string | null
  readonly eligibilityStatus: string | null
  readonly eligibilityReason: string | null
  readonly version: number | null
}

export async function loadTravelerSources(manager: EntityManager, scope: { readonly tourSessionId: string; readonly classId: string | null }): Promise<readonly TravelerSource[]> {
  const params = scope.classId === null ? [scope.tourSessionId] : [scope.tourSessionId, scope.classId]
  const paid: readonly SourceRow[] = await manager.query(`
    select ol.id, ol.organization_id as organizationId, e.tour_session_id as tourSessionId,
      ol.display_name_snapshot as displayName, fm.grade_id as gradeId, fm.class_id as classId,
      coalesce(ol.grade_name_snapshot, sg.name) as gradeName, coalesce(ol.class_name_snapshot, sc.name) as className,
      ol.participant_kind_snapshot as participantKind, null as importedRole,
      ol.identity_hash_snapshot as identityHash, ol.phone_hash_snapshot as phoneHash,
      ol.identity_masked_snapshot as identityMasked, ol.phone_masked_snapshot as phoneMasked,
      ol.identity_ciphertext_snapshot as identityCiphertext, ol.phone_ciphertext_snapshot as phoneCiphertext,
      ol.person_data_key_version_snapshot as personDataKeyVersion,
      ep.family_id as familyId, ep.family_member_id as familyMemberId, o.id as orderId, ol.id as orderLineId,
      null as importPersonId, o.status as orderStatus, re.status as rosterStatus,
      null as importStatus, null as eligibilityStatus, null as eligibilityReason, null as version
    from order_lines ol join orders o on o.id = ol.order_id
    join enrollments e on e.id = o.enrollment_id
    join enrollment_participants ep on ep.id = ol.enrollment_participant_id
    join family_members fm on fm.id = ep.family_member_id
    left join school_grades sg on sg.id = fm.grade_id
    left join school_classes sc on sc.id = fm.class_id
    left join roster_entries re on re.enrollment_participant_id = ep.id and re.enrollment_id = e.id
    where e.tour_session_id = ?
      and exists (select 1 from payments p where p.order_id = o.id and p.status = 'succeeded')
      ${scope.classId === null ? "" : "and fm.class_id = ?"}
    order by ol.id`, params)
  const imported: readonly SourceRow[] = await manager.query(`
    select ip.id, ip.organization_id as organizationId, ip.tour_session_id as tourSessionId,
      ip.display_name as displayName, ip.grade_id as gradeId, ip.class_id as classId,
      sg.name as gradeName, coalesce(sc.name, ip.source_class_name) as className,
      case when ip.role = 'student' then 'student' else 'adult' end as participantKind, ip.role as importedRole,
      ip.identity_hash as identityHash, ip.phone_hash as phoneHash,
      ip.identity_masked as identityMasked, ip.phone_masked as phoneMasked,
      ip.identity_ciphertext as identityCiphertext, ip.phone_ciphertext as phoneCiphertext,
      ip.person_data_key_version as personDataKeyVersion,
      null as familyId, null as familyMemberId, null as orderId, null as orderLineId, ip.id as importPersonId,
      null as orderStatus, null as rosterStatus, ip.status as importStatus,
      ip.eligibility_status as eligibilityStatus, ip.eligibility_reason as eligibilityReason, ip.version
    from roster_import_people ip left join school_grades sg on sg.id = ip.grade_id
    left join school_classes sc on sc.id = ip.class_id
    where ip.tour_session_id = ? ${scope.classId === null ? "" : "and ip.class_id = ?"}
    order by ip.id`, params)
  const sources = [...paid.map(paidSource), ...imported.map(importedSource)]
  if (scope.classId !== null) await assertNoOutsideSources(manager, { tourSessionId: scope.tourSessionId, classId: scope.classId }, sources)
  return sources
}

function paidSource(row: SourceRow): TravelerSource {
  const cancelled = row.rosterStatus === "cancelled"
  const active = row.orderStatus === "paid" && row.rosterStatus !== null && !cancelled
  return { ...row, personRef: `paid:${row.id}`, source: "paid", active,
    inactiveReason: cancelled ? "cancelled" : active ? null : "payment_inactive", eligibility: "paid", importVersion: null }
}

function importedSource(row: SourceRow): TravelerSource {
  const disabled = row.importStatus === "disabled"
  const eligibility = disabled ? "disabled" : row.importedRole === "teacher" ? "teacher" : row.eligibilityStatus === "confirmed" ? "confirmed" : "pending"
  const active = eligibility === "teacher" || eligibility === "confirmed"
  return { ...row, personRef: `imported:${row.id}`, source: "imported", active, eligibility,
    inactiveReason: disabled ? "import_disabled" : active ? null : "eligibility_pending", importVersion: row.version }
}

async function assertNoOutsideSources(manager: EntityManager, scope: { readonly tourSessionId: string; readonly classId: string }, sources: readonly TravelerSource[]): Promise<void> {
  const hashes = [...new Set(sources.map((source) => source.identityHash).filter((value) => value !== null))]
  if (hashes.length === 0) return
  const placeholders = hashes.map(() => "?").join(",")
  const outside: readonly { readonly id: string }[] = await manager.query(`
    select ip.id from roster_import_people ip where ip.tour_session_id = ? and not (ip.class_id <=> ?)
      and ip.identity_hash in (${placeholders})
    union all
    select ol.id from order_lines ol join orders o on o.id = ol.order_id
      join enrollments e on e.id = o.enrollment_id join enrollment_participants ep on ep.id = ol.enrollment_participant_id
      join family_members fm on fm.id = ep.family_member_id
      where e.tour_session_id = ? and not (fm.class_id <=> ?) and ol.identity_hash_snapshot in (${placeholders})
      and exists (select 1 from payments p where p.order_id = o.id and p.status = 'succeeded')
    limit 1`, [scope.tourSessionId, scope.classId, ...hashes, scope.tourSessionId, scope.classId, ...hashes])
  if (outside.length > 0) throw new ForbiddenException({ code: "traveler_source_scope_forbidden", message: "人员包含其他班级来源，请由学校授权人员核对" })
}
