const SERVICE_CONSENT_KEY = "linan_service_consent" as const
const SERVICE_CONSENT_VERSION = "2026-10-03.2" as const
let browsingThisLaunch = false

function readConsent(): "accepted" | "declined" | undefined {
  const value: unknown = uni.getStorageSync(SERVICE_CONSENT_KEY)
  if (typeof value !== "object" || value === null || !("version" in value)
    || value.version !== SERVICE_CONSENT_VERSION || !("choice" in value)) return undefined
  return value.choice === "accepted" || value.choice === "declined" ? value.choice : undefined
}

export function hasServiceConsent(): boolean { return readConsent() === "accepted" }
export function hasSeenServiceConsent(): boolean { return hasServiceConsent() || browsingThisLaunch }
export function acceptServiceConsent(): void {
  uni.setStorageSync(SERVICE_CONSENT_KEY, { version: SERVICE_CONSENT_VERSION, choice: "accepted" })
  browsingThisLaunch = false
}
export function declineServiceConsent(): void {
  browsingThisLaunch = true
}
