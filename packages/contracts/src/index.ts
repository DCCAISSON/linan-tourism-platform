export const HEALTH_STATUS = {
  ok: "ok",
} as const

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS]

export type HealthResponse = {
  readonly status: HealthStatus
  readonly service: "@linan/api"
}
