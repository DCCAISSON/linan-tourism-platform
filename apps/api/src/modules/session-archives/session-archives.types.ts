export const ARCHIVE_SECTIONS = ["orders", "roster", "transport", "execution", "evaluations", "refunds"] as const
export type ArchiveSectionKey = typeof ARCHIVE_SECTIONS[number]
export type ArchiveCell = string | number | boolean | null
export type ArchiveSection = {
  readonly key: ArchiveSectionKey
  readonly capturedAt: string
  readonly permissionKeys: readonly string[]
  readonly scope: { readonly id: string; readonly organizationId: string }
  readonly status: string
  readonly columns: readonly string[]
  readonly rows: readonly (readonly ArchiveCell[])[]
}
