import { afterEach, describe, expect, it, vi } from "vitest"
import { applySmsAttempt, assertSmsConfigured, parseSmsLoginInput, parseSmsSendInput, parseWechatPhoneLoginInput, SMS_MAX_ATTEMPTS, smsVerificationDecision } from "./phone-auth.service.js"
import { exchangeWechatPhone, sameFamilyCode } from "./wechat-auth.service.js"
import { PhoneSmsChallengeEntity } from "../../domain/entities/phone-sms-challenge.entity.js"
import { phoneVerificationRequired } from "../enrollment/enrollment.service.js"
import { hashPhone, hashSmsCode } from "./wechat-session-token.js"

describe("phone authentication request boundaries", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it("accepts the three phone authentication payloads", () => {
    expect(parseWechatPhoneLoginInput({ loginCode: "login-code", phoneCode: "phone-code" })).toEqual({ loginCode: "login-code", phoneCode: "phone-code" })
    expect(parseSmsSendInput({ phone: "13800138000" })).toEqual({ phone: "13800138000" })
    expect(parseSmsLoginInput({ loginCode: "login-code", phone: "13800138000", code: "123456" })).toEqual({ loginCode: "login-code", phone: "13800138000", code: "123456" })
  })

  it("rejects malformed phone authentication payloads", () => {
    expect(() => parseWechatPhoneLoginInput({ loginCode: "", phoneCode: "phone-code" })).toThrow()
    expect(() => parseSmsSendInput({ phone: "123" })).toThrow()
    expect(() => parseSmsLoginInput({ loginCode: "login-code", phone: "13800138000", code: "12345" })).toThrow()
  })

  it("rejects unconfigured SMS instead of pretending that it sent a code", () => {
    vi.stubEnv("TENCENT_CLOUD_SECRET_ID", "")
    expect(() => assertSmsConfigured()).toThrow("短信服务尚未配置")
  })

  it("uses the official access token and getuserphonenumber exchange", async () => {
    vi.stubEnv("WECHAT_MINIAPP_APP_ID", "app-id")
    vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "app-secret")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ access_token: "access-token" }) })
      .mockResolvedValueOnce({ json: async () => ({ phone_info: { phoneNumber: "13800138000" } }) })
    vi.stubGlobal("fetch", fetchMock)

    await expect(exchangeWechatPhone("phone-code")).resolves.toBe("13800138000")

    expect(fetchMock.mock.calls).toHaveLength(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("getuserphonenumber")
  })

  it("rejects expired, replayed, and exhausted SMS challenges", () => {
    const challenge = new PhoneSmsChallengeEntity()
    challenge.codeHash = "correct"
    challenge.expiresAt = new Date("2026-10-01T00:05:00.000Z")

    expect(smsVerificationDecision(challenge, "correct", new Date("2026-10-01T00:05:00.000Z"))).toBe("expired")
    challenge.expiresAt = new Date("2026-10-01T00:06:00.000Z")
    challenge.consumedAt = new Date("2026-10-01T00:01:00.000Z")
    expect(smsVerificationDecision(challenge, "correct", new Date("2026-10-01T00:02:00.000Z"))).toBe("replayed")
    challenge.consumedAt = null
    challenge.attemptCount = SMS_MAX_ATTEMPTS
    expect(smsVerificationDecision(challenge, "correct", new Date("2026-10-01T00:02:00.000Z"))).toBe("exhausted")
  })

  it("requires a verified phone only for new production enrollments", () => {
    expect(phoneVerificationRequired("production", false)).toBe(true)
    expect(phoneVerificationRequired("production", true)).toBe(false)
    expect(phoneVerificationRequired("development", false)).toBe(false)
  })

  it("rejects a phone identity that belongs to another family", () => {
    expect(sameFamilyCode("family-a", "family-b")).toBe(false)
    expect(sameFamilyCode("family-a", "family-a")).toBe(true)
  })

  it("returns an invalid-code decision after persisting the failed attempt", () => {
    const challenge = new PhoneSmsChallengeEntity()
    challenge.codeHash = "correct"
    challenge.expiresAt = new Date("2026-10-01T00:06:00.000Z")

    const result = applySmsAttempt(challenge, "wrong", new Date("2026-10-01T00:02:00.000Z"))

    expect(result).toBe("invalid")
    expect(challenge.attemptCount).toBe(1)
  })

  it("uses a required keyed digest for phone and SMS-code persistence", () => {
    vi.stubEnv("PHONE_AUTH_HMAC_KEY", "01234567890123456789012345678901")
    const phoneHash = hashPhone("13800138000")

    expect(phoneHash).toHaveLength(64)
    expect(phoneHash).not.toContain("13800138000")
    expect(hashSmsCode(phoneHash, "123456")).not.toBe(hashSmsCode(phoneHash, "654321"))
    vi.stubEnv("PHONE_AUTH_HMAC_KEY", "")
    expect(() => hashPhone("13800138000")).toThrow("手机认证服务尚未配置")
  })
})
