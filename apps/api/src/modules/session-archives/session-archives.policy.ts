import { BadRequestException, ForbiddenException } from "@nestjs/common"
import type { DevStaffAccessService, StaffAccess } from "../iam/dev-staff-access.service.js"
import { canReadSchoolEvaluations } from "../evaluations/evaluations.policy.js"
import { assertApplicationPermission } from "../refund-applications/refund-application.policy.js"
import { hasSessionScope } from "../execution/execution-access.policy.js"
import { ARCHIVE_SECTIONS, type ArchiveSectionKey } from "./session-archives.types.js"

export const SECTION_PERMISSIONS: Record<ArchiveSectionKey, readonly string[]> = {
  orders: ["orders.read"], refunds: ["orders.read", "refunds.review|refunds.execute"], roster: ["roster.export"], transport: ["transport.export"], execution: ["execution.read", "execution.manage"], evaluations: ["evaluations.school_report"],
}
export function parseArchiveSections(body: unknown): readonly ArchiveSectionKey[] {
  const sections: unknown = typeof body === "object" && body !== null ? Object.fromEntries(Object.entries(body))["sections"] : undefined
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > 6 || !sections.every(isSection) || new Set(sections).size !== sections.length) throw new BadRequestException({ code: "archive_sections_invalid", message: "请选择不重复的归档资料类别" })
  return sections
}
function isSection(value: unknown): value is ArchiveSectionKey { return ARCHIVE_SECTIONS.some(key => key === value) }

export function assertArchiveSection(gate: DevStaffAccessService, access: StaffAccess, session: { readonly id: string; readonly organizationId: string }, key: ArchiveSectionKey): void {
  const scope = { schoolId: session.organizationId, requestedSchoolId: session.organizationId, requestedClassId: null, tourSessionId: session.id }
  switch (key) {
    case "orders": gate.assertOrderReadScope(access); return
    case "refunds": gate.assertOrderReadScope(access); assertApplicationPermission(access, "read"); return
    case "roster": gate.assertRosterExportScope(access, scope); return
    case "transport": gate.assertTransportExportScope(access, scope); return
    case "evaluations": if (canReadSchoolEvaluations(access, session.organizationId)) return; break
    case "execution":
      if (access.permissionKeys.has("execution.read") && access.permissionKeys.has("execution.manage") && hasSessionScope(access, session)) return
  }
  throw new ForbiddenException({ code: "archive_section_forbidden", message: "无权读取该团期的归档资料" })
}
