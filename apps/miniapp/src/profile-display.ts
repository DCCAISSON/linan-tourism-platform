export type LocalProfile = {
  readonly nickname: string
  readonly avatarPath: string
}

const storagePrefix = "linan_local_profile" as const
const completionPrefix = "linan_local_profile_completed" as const

export function loadLocalProfile(owner: string): LocalProfile | null {
  try {
    const value: unknown = uni.getStorageSync(storageKey(owner))
    if (!isLocalProfile(value)) return null
    return value
  } catch {
    return null
  }
}

export function saveLocalProfile(owner: string, profile: LocalProfile): void {
  uni.setStorageSync(storageKey(owner), profile)
  uni.setStorageSync(completionKey(owner), true)
}

export function hasCompletedLocalProfile(owner: string): boolean {
  return uni.getStorageSync(completionKey(owner)) === true
}

export async function persistAvatar(tempFilePath: string): Promise<string> {
  return await new Promise((resolve, reject) => uni.saveFile({
    tempFilePath,
    success: (result) => resolve(result.savedFilePath),
    fail: reject,
  }))
}

export function discardPersistedAvatar(filePath: string): void {
  if (typeof uni.removeSavedFile !== "function") return
  uni.removeSavedFile({ filePath, fail: () => undefined })
}

function storageKey(owner: string): string {
  return `${storagePrefix}:${owner}`
}

function completionKey(owner: string): string {
  return `${completionPrefix}:${owner}`
}

function isLocalProfile(value: unknown): value is LocalProfile {
  return typeof value === "object" && value !== null
    && "nickname" in value && typeof value.nickname === "string"
    && "avatarPath" in value && typeof value.avatarPath === "string"
}
