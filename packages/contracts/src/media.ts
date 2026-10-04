export type MediaKind = "image" | "video"
export type MediaStatus = "uploading" | "draft" | "published" | "failed"
export type MediaAsset = {
  readonly id: string
  readonly tourSessionId: string
  readonly title: string
  readonly kind: MediaKind
  readonly contentType: string
  readonly byteSize: number
  readonly status: MediaStatus
  readonly version: number
  readonly authorStaffId: string
  readonly createdAt: string
  readonly cleanupPending: boolean
}
export type MediaProvider = {
  readonly kind: "album" | "live"
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly version: number
}
export type MediaCollection = {
  readonly assets: readonly MediaAsset[]
  readonly providers: readonly MediaProvider[]
}
export type MediaSession = { readonly id: string; readonly code: string }
