import { createHash } from "node:crypto"

export const STAFF_SESSION_COOKIE = "linan_staff_session"

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
