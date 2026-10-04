import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveAdminApiBaseUrlForEnv } from "../src/api/base-url"

describe("resolveAdminApiBaseUrl", () => {
  it("uses the formal HTTPS API host for production bundles without an explicit API base URL", () => {
    expect(resolveAdminApiBaseUrlForEnv({ DEV: false })).toBe("https://api.linantravel.cn")
  })

  it("keeps the local API base URL for development when no API base URL is configured", () => {
    expect(resolveAdminApiBaseUrlForEnv({ DEV: true })).toBe("http://127.0.0.1:3000")
  })

  it("uses the configured API base URL when provided", () => {
    expect(resolveAdminApiBaseUrlForEnv({ VITE_API_BASE_URL: "https://api.linantravel.cn/", DEV: false })).toBe("https://api.linantravel.cn")
  })

  it("keeps deployment build defaults on the formal API host", () => {
    const root = join(__dirname, "..", "..", "..")
    const dockerfile = readFileSync(join(root, "deploy", "Dockerfile"), "utf8")
    const compose = readFileSync(join(root, "deploy", "docker-compose.yml"), "utf8")
    expect(dockerfile).toContain("ARG VITE_API_BASE_URL=https://api.linantravel.cn")
    expect(compose).toContain("VITE_API_BASE_URL: ${LINAN_PUBLIC_API_BASE_URL:-https://api.linantravel.cn}")
  })

  it("keeps deployment admin origin defaults on the formal admin host while allowing overrides", () => {
    const root = join(__dirname, "..", "..", "..")
    const compose = readFileSync(join(root, "deploy", "docker-compose.yml"), "utf8")
    expect(compose).toContain("ADMIN_WEB_ORIGIN: ${LINAN_PUBLIC_ADMIN_ORIGIN:-https://admin.linantravel.cn}")
  })

  it("keeps deployment API in production mode", () => {
    const root = join(__dirname, "..", "..", "..")
    const compose = readFileSync(join(root, "deploy", "docker-compose.yml"), "utf8")
    expect(compose).toContain("NODE_ENV: production")
  })
})
