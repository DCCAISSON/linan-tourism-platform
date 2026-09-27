import { ref } from "vue"
import { ApiError, createMiniappApi } from "../../api"
import type { FamilyMember } from "../../enrollment-flow"
import { createExecutionHealthClient } from "../../execution-health-api"

type PendingHealth = {
  readonly memberId: string
  readonly familyMemberId: string
  readonly medicalNotes: string
}

export function useEnrollmentHealth() {
  const healthState = ref<"idle" | "saving" | "error" | "saved">("idle")
  const healthNeedsLogin = ref(false)
  const healthMessage = ref("")
  let pending: readonly PendingHealth[] = []

  function captureHealth(members: readonly FamilyMember[]): void {
    pending = members.flatMap((member) => {
      const notes = member.healthNotes?.trim() ?? ""
      return member.selected && member.healthConsent === true && notes.length > 0 && member.remoteMemberId !== undefined
        ? [{ memberId: member.id, familyMemberId: member.remoteMemberId, medicalNotes: notes }]
        : []
    })
  }

  async function saveHealth(orderId: string, members: readonly FamilyMember[]): Promise<boolean> {
    if (healthState.value === "saving") return false
    if (pending.length === 0) {
      clearNotes(members)
      return true
    }
    healthState.value = "saving"
    healthNeedsLogin.value = false
    healthMessage.value = "正在保存健康备注…"
    try {
      const detail = await createMiniappApi().getOrderDetail(orderId)
      const client = createExecutionHealthClient()
      for (const item of pending) {
        const lines = detail.participants.filter((line) => line.familyMemberId === item.familyMemberId)
        const line = lines[0]
        if (lines.length !== 1 || line === undefined) throw new ApiError(0, "参加人信息尚未核对完成，请稍后重试")
        await client.authorizePaidHealth(orderId, line.id, { allergies: "", medicalNotes: item.medicalNotes, emergencyMedicine: "" })
        pending = pending.filter((entry) => entry.memberId !== item.memberId)
        const member = members.find((entry) => entry.id === item.memberId)
        if (member !== undefined) { delete member.healthNotes; member.healthConsent = false }
      }
      clearNotes(members)
      healthState.value = "saved"
      healthMessage.value = "健康备注已保存，可在订单的健康信息页撤回授权。"
      return true
    } catch (error) {
      healthState.value = "error"
      healthNeedsLogin.value = error instanceof ApiError && error.statusCode === 401
      healthMessage.value = healthNeedsLogin.value
        ? "报名已提交，健康备注尚未全部保存。请重新登录后继续保存。"
        : "报名已提交，健康备注尚未全部保存。请重试保存，无需重复报名。"
      return false
    }
  }

  function clearNotes(members: readonly FamilyMember[]): void {
    for (const member of members) { delete member.healthNotes; member.healthConsent = false }
  }

  function resetHealth(): void {
    pending = []
    healthState.value = "idle"
    healthNeedsLogin.value = false
    healthMessage.value = ""
  }

  return { healthState, healthNeedsLogin, healthMessage, captureHealth, saveHealth, resetHealth }
}
