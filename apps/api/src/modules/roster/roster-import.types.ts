export type RosterImportTemplate = "parent_child" | "grade_3_6" | "teacher"
export type RosterImportRole = "student" | "guardian" | "teacher"

export type ParsedRosterPerson = {
  readonly role: RosterImportRole
  readonly displayName: string
  readonly identityNumber: string
  readonly phone: string
}

export type ParsedRosterImportRow = {
  readonly rowNumber: number
  readonly className: string
  readonly people: readonly ParsedRosterPerson[]
}

export type RosterImportScopeInput = {
  readonly template: RosterImportTemplate
  readonly tourSessionId: string
  readonly schoolId: string
  readonly gradeId: string | null
  readonly classId: string | null
}

export type RosterImportRequest = RosterImportScopeInput & {
  readonly fileName: string
  readonly buffer: Buffer
}

export type RosterImportErrorRow = {
  readonly rowNumber: number
  readonly role: RosterImportRole | null
  readonly field: string
  readonly message: string
}

export type RosterImportBatchResponse = {
  readonly id: string
  readonly sourceTemplate: RosterImportTemplate
  readonly tourSessionId: string
  readonly schoolId: string
  readonly gradeId: string | null
  readonly classId: string | null
  readonly fileName: string
  readonly totalRows: number
  readonly importedCount: number
  readonly duplicateCount: number
  readonly errorCount: number
  readonly errors: readonly RosterImportErrorRow[]
}
