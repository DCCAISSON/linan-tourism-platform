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
