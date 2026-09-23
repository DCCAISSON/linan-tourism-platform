import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const source = resolve(root, "src")
const output = resolve(root, "dist")

rmSync(output, { force: true, recursive: true })
mkdirSync(output, { recursive: true })
for (const fileName of readdirSync(source)) {
  copyFileSync(resolve(source, fileName), resolve(output, fileName))
}

const publicSecurityNumber = process.env["SITE_PUBLIC_SECURITY_NUMBER"] ?? ""
const publicSecurityUrl = process.env["SITE_PUBLIC_SECURITY_URL"] ?? ""
const config = {
  contactEmail: process.env["SITE_CONTACT_EMAIL"] ?? "",
  contactPhone: process.env["SITE_CONTACT_PHONE"] ?? "",
  icpNumber: process.env["SITE_ICP_NUMBER"] ?? "",
  publicSecurityNumber,
  publicSecurityUrl,
}

writeFileSync(resolve(output, "site-config.js"), `window.__LINAN_SITE_CONFIG__ = ${JSON.stringify(config)}\n`, "utf8")
