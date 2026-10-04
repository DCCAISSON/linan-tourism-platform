import { describe, expect, it } from "vitest"
import { canRetryNotificationTargets, createNotificationPreviewSelection, isNotificationPreviewCurrent, notificationAttemptTargetLabel, userNotificationAttemptGuidance } from "@/api/notifications.policy"
import type { UserMessageDetail } from "@/api/user-notifications"

describe("notification page policies", () => {
  it.each([
    ["api_accepted", null, "微信接口已受理，请以本人手机实际收到为准。"],
    ["rejected", "43101", "未订阅或无可用订阅次数，请本人重新同意订阅后再安排发送。"],
    ["rejected", "45009", "发送次数受限，请稍后核对可用订阅次数后处理。"],
    ["unknown", "wechat_transport_unknown", "发送结果尚未确认，请人工核对，不要直接重复发送。"],
    ["unknown", "result_unknown", "发送结果尚未确认，请人工核对，不要直接重复发送。"],
    ["unknown", null, "发送结果尚未确认，请人工核对，不要直接重复发送。"],
    ["blocked", "subscription_unavailable", "当前订阅授权或模板已不可用，本次未发送；请重新核对当前授权和模板。"],
    ["unknown", "40003", "接收人标识无效，请联系管理员核对该用户的小程序身份。"],
    ["unknown", "40037", "消息模板无效，请联系管理员核对模板是否属于当前小程序。"],
    ["unknown", "47003", "消息内容不符合模板要求，请核对字段类型、长度和格式。"],
    ["rejected", "unrecognized_code", "发送未被受理，请联系管理员核对错误码后处理。"],
    ["blocked", null, "本次已阻止发送，请联系管理员核对当前订阅授权和模板。"],
  ] satisfies readonly (readonly [UserMessageDetail["attempts"][number]["status"], string | null, string])[])("explains %s / %s without inferring delivery or provider quota use", (status, errorCode, expected) => {
    // Given
    const attempt = { id: "attempt-1", targetId: "target-1", status, errorCode }
    // When
    const guidance = userNotificationAttemptGuidance(attempt)
    // Then
    expect(guidance).toBe(expected)
  })

  it("keeps a preview bound to the loaded session and authorization snapshot", () => {
    const ids = ["authorization-1"]
    const selection = createNotificationPreviewSelection("session-1", ids)
    ids.push("authorization-2")

    expect(selection.authorizationIds).toEqual(["authorization-1"])
    expect(isNotificationPreviewCurrent(selection, "session-1", ["authorization-1"])).toBe(true)
    expect(isNotificationPreviewCurrent(selection, "session-2", ["authorization-1"])).toBe(false)
    expect(isNotificationPreviewCurrent(selection, "session-1", ["authorization-2"])).toBe(false)
  })

  it("enables explicit retry when any target is retryable despite the task summary", () => {
    expect(canRetryNotificationTargets([{ status: "manual_required" }, { status: "retryable_failed" }])).toBe(true)
    expect(canRetryNotificationTargets([{ status: "manual_required" }, { status: "api_accepted" }])).toBe(false)
  })

  it("maps an attempt to its receiver and preserves unknown target ids", () => {
    const targets = [{ id: "target-1", receiverName: "林女士" }]
    expect(notificationAttemptTargetLabel("target-1", targets)).toBe("林女士 · target-1")
    expect(notificationAttemptTargetLabel("missing", targets)).toBe("missing")
  })
})
