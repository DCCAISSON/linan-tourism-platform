import { ForbiddenException } from "@nestjs/common"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { TravelerDto } from "../travelers/travelers.types.js"
import type { EvaluationSummaryRow, SchoolEvaluationRow } from "./evaluations.types.js"

export type EvaluationActor = StaffAccess | {
  readonly kind: "family"
  readonly actorId: string
  readonly permissionKeys: ReadonlySet<string>
  readonly scopes: readonly []
}

export function isEligibleEvaluationStudent(row: Pick<TravelerDto, "active" | "conflict" | "participantKind" | "importedRole">): boolean {
  return row.active && row.conflict === null && (row.participantKind === "student" || row.importedRole === "student")
}

export function assertEvaluationPermission(actor: EvaluationActor, permission: string): void {
  if (actor.kind === "family" || !new Set<string>(actor.permissionKeys).has(permission)) {
    throw new ForbiddenException({ code: "evaluation_forbidden", message: "no evaluation access" })
  }
}

export function canReadSchoolEvaluations(access: StaffAccess, organizationId: string): boolean {
  return new Set<string>(access.permissionKeys).has("evaluations.school_report") && access.scopes.some((scope) =>
    scope.kind === "all" || ((scope.kind === "organization" || scope.kind === "school") && scope.id === organizationId),
  )
}

export function filterSchoolConfirmedGrades(rows: readonly EvaluationSummaryRow[], organizationId: string): readonly SchoolEvaluationRow[] {
  const result: SchoolEvaluationRow[] = []
  for (const row of rows) {
    if (row.organizationId === organizationId && row.confirmedAt !== null && row.gradeCode !== null && row.gradeLabel !== null) {
      result.push({
        personRef: row.personRef,
        displayName: row.displayName,
        gradeName: row.gradeName,
        className: row.className,
        gradeCode: row.gradeCode,
        gradeLabel: row.gradeLabel,
      })
    }
  }
  return result
}

export function schoolReportRows(rows: readonly EvaluationSummaryRow[], organizationId: string): readonly (readonly string[])[] {
  return [
    ["姓名", "年级", "班级", "等级", "等级说明"],
    ...filterSchoolConfirmedGrades(rows, organizationId).map((row) => [
      row.displayName,
      row.gradeName ?? "",
      row.className ?? "",
      row.gradeCode,
      row.gradeLabel,
    ]),
  ]
}
