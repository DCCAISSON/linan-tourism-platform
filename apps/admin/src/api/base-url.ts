type AdminApiEnv = {
  readonly VITE_API_BASE_URL?: string
  readonly DEV?: boolean
  readonly PROD?: boolean
}

const productionApiBaseUrl = "https://api.linantravel.cn"

export function resolveAdminApiBaseUrl(): string {
  const configured = import.meta.env["VITE_API_BASE_URL"]?.trim()
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/$/, "")
  }
  return import.meta.env["DEV"] ? localDevelopmentApiBaseUrl() : productionApiBaseUrl
}

export function resolveAdminApiBaseUrlForEnv(env: AdminApiEnv): string {
  const configured = env.VITE_API_BASE_URL?.trim()
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/$/, "")
  }
  return env.DEV === true ? localDevelopmentApiBaseUrl() : productionApiBaseUrl
}

function localDevelopmentApiBaseUrl(): string {
  return "http://127.0.0.1:3000"
}
