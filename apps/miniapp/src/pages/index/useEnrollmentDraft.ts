import { ref, watch } from "vue"
import { onHide, onShow, onUnload } from "@dcloudio/uni-app"
import { createEmptyDraft, type EnrollmentDraft, type FamilyMember } from "../../enrollment-flow"
import { getEnrollmentDraftOwner } from "../../wechat-token"

type MutableDraft = { -readonly [Key in keyof EnrollmentDraft]: EnrollmentDraft[Key] } & { familyMembers: FamilyMember[] }

export function useEnrollmentDraft(draft: MutableDraft, reportError: (message: string) => void, accountChanged: () => void) {
  let owner = getEnrollmentDraftOwner()
  let scope = ""
  let paused = true
  let submitted = false
  let cleared = false
  const status = ref("")
  const key = () => `linan_enrollment_draft_v1:${encodeURIComponent(owner)}:${encodeURIComponent(scope)}`
  const latestKey = () => `linan_enrollment_draft_latest:${encodeURIComponent(owner)}`

  function save(): void {
    if (paused || submitted || cleared || owner !== getEnrollmentDraftOwner() || typeof uni === "undefined" || typeof uni.setStorageSync !== "function") return
    try {
      uni.setStorageSync(key(), JSON.stringify({ ...draft, agreementAccepted: false,
        familyMembers: draft.familyMembers.map(member => ({ ...member, healthConsent: false })) }))
      uni.setStorageSync(latestKey(), scope)
      status.value = ""
    } catch (error) {
      status.value = "草稿未能保存"
      reportError(error instanceof Error ? `草稿未能保存：${error.message}` : "草稿未能保存，请检查设备存储空间")
    }
  }

  function restore(sessionId: string, useLatest = false): boolean {
    paused = true
    scope = sessionId
    submitted = false
    cleared = false
    status.value = ""
    if (!sessionId && !useLatest) { paused = false; return false }
    try {
      if (useLatest && !sessionId && typeof uni !== "undefined" && typeof uni.getStorageSync === "function") {
        const latest: unknown = uni.getStorageSync(latestKey())
        if (typeof latest === "string") scope = latest
      }
      const value: unknown = typeof uni === "undefined" || typeof uni.getStorageSync !== "function" ? undefined : uni.getStorageSync(key())
      if (typeof value !== "string" || !value) { paused = false; return false }
      const parsed: unknown = JSON.parse(value)
      if (!isDraft(parsed)) { paused = false; return false }
      Object.assign(draft, parsed, { agreementAccepted: false, familyMembers: parsed.familyMembers.map(member => ({ ...member, healthConsent: false })) })
      paused = false
      return true
    } catch (error) {
      paused = false
      status.value = "草稿未能恢复"
      reportError(error instanceof Error ? "已保存的报名草稿无法读取，请重新填写" : "报名草稿读取失败")
      return false
    }
  }

  function syncOwner(adoptGuest = false): boolean {
    const current = getEnrollmentDraftOwner()
    if (current === owner) return false
    const wasGuest = owner === "guest"
    const previousKey = key()
    paused = true
    owner = current
    if (adoptGuest && wasGuest) {
      const familyDraft = typeof uni === "undefined" || typeof uni.getStorageSync !== "function" ? undefined : uni.getStorageSync(key())
      const guestDraft = typeof uni === "undefined" || typeof uni.getStorageSync !== "function" ? undefined : uni.getStorageSync(previousKey)
      if (typeof familyDraft === "string" && familyDraft.length > 0 && typeof guestDraft === "string" && guestDraft.length > 0) {
        paused = false
        accountChanged()
        return true
      }
      const restored = restore(scope, true)
      if (!restored) {
        uni.removeStorageSync(previousKey)
        save()
      }
      accountChanged()
      return true
    }
    if (!adoptGuest || !wasGuest) Object.assign(draft, createEmptyDraft())
    restore(scope, true)
    accountChanged()
    return true
  }

  function clear(): void {
    submitted = true
    if (typeof uni !== "undefined" && typeof uni.removeStorageSync === "function") {
      uni.removeStorageSync(key())
      if (uni.getStorageSync(latestKey()) === scope) uni.removeStorageSync(latestKey())
    }
  }

  function reset(): boolean {
    if (owner !== getEnrollmentDraftOwner()) { syncOwner(); return false }
    try {
      uni.removeStorageSync(key())
      if (uni.getStorageSync(latestKey()) === scope) uni.removeStorageSync(latestKey())
    } catch (error) {
      reportError(error instanceof Error ? `草稿未能清除：${error.message}` : "草稿未能清除，请重试")
      return false
    }
    paused = true
    const { selectedSchoolId, selectedTourSessionId } = draft
    const familyMembers = draft.familyMembers.filter(member => member.fromCommonList)
      .map(member => ({ ...member, selected: false, healthNotes: "", healthConsent: false }))
    Object.assign(draft, createEmptyDraft(), { selectedSchoolId, selectedTourSessionId, familyMembers })
    submitted = false
    cleared = true
    paused = false
    status.value = ""
    return true
  }

  watch(draft, () => { if (!paused) cleared = false; save() }, { deep: true, flush: "sync" })
  onHide(save)
  onUnload(save)
  onShow(() => { syncOwner() })
  return { status, reset, save, restore, syncOwner, clear, pause: () => { paused = true }, resume: () => { paused = false } }
}

function isDraft(value: unknown): value is EnrollmentDraft {
  if (typeof value !== "object" || value === null) return false
  const strings = ["contactName", "contactPhone", "selectedSchoolId", "selectedGradeId", "selectedClassId", "selectedTourSessionId"]
  if (!strings.every(key => key in value && typeof Reflect.get(value, key) === "string")) return false
  if (!("agreementAccepted" in value) || typeof value.agreementAccepted !== "boolean"
    || !("emergencySameAsParent" in value) || typeof value.emergencySameAsParent !== "boolean"
    || !("emergencyContact" in value) || typeof value.emergencyContact !== "object" || value.emergencyContact === null
    || !("name" in value.emergencyContact) || typeof value.emergencyContact.name !== "string"
    || !("phone" in value.emergencyContact) || typeof value.emergencyContact.phone !== "string"
    || !("familyMembers" in value) || !Array.isArray(value.familyMembers)) return false
  return value.familyMembers.every((member: unknown) => {
    if (typeof member !== "object" || member === null) return false
    return ["id", "code", "displayName"].every(key => key in member && typeof Reflect.get(member, key) === "string")
      && "selected" in member && typeof member.selected === "boolean"
      && ["identityNumber", "phone", "remoteMemberId", "healthNotes"].every(key => !(key in member) || typeof Reflect.get(member, key) === "string")
      && ["saveAsCommon", "fromCommonList", "healthConsent"].every(key => !(key in member) || typeof Reflect.get(member, key) === "boolean")
      && (!("participantKind" in member) || member.participantKind === "student" || member.participantKind === "adult")
  })
}
