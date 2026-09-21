export type RosterQuery = {
  readonly tourSessionId: string
  readonly schoolId?: string
  readonly gradeId?: string
  readonly classId?: string
}

export type RosterFilters = RosterQuery

export type RosterRow = {
  readonly participantId: string
  readonly displayName: string
  readonly schoolId: string
  readonly schoolName: string
  readonly gradeId: string | null
  readonly gradeName: string | null
  readonly classId: string | null
  readonly className: string | null
  readonly amountFen: number
}

export type RosterSummary = {
  readonly filters: RosterFilters
  readonly paidHeadcount: number
  readonly paidAmountFen: number
  readonly rows: readonly RosterRow[]
}


export type RosterImportTemplate = "parent_child" | "grade_3_6" | "teacher"

export type RosterImportErrorRow = {
  readonly rowNumber: number
  readonly role: "student" | "guardian" | "teacher" | null
  readonly field: string
  readonly message: string
}

export type RosterImportResult = {
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

export type RosterImportPayload = RosterQuery & {
  readonly template: RosterImportTemplate
  readonly file: File
}
