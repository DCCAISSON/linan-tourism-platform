export type WorkbenchSession = {
  readonly id: string
  readonly code: string
  readonly organizationId: string
  readonly schoolName: string
  readonly catalogItemId: string
  readonly activityTitle: string
  readonly startsAt: string
  readonly endsAt: string
  readonly status: "published"
  readonly priceFen: number
  readonly capacity: number
}

export type WorkbenchSummary = {
  readonly generatedAt: string
  readonly upcomingFrom: string
  readonly upcomingUntil: string
  readonly activeActivityCount: number
  readonly upcomingSessionCount: number
  readonly paidHeadcount: number
  readonly paidAmountFen: number
  readonly upcomingSessions: readonly WorkbenchSession[]
}
