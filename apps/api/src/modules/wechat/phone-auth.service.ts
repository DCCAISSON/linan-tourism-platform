import { randomInt } from "node:crypto"
import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common"
import { sms } from "tencentcloud-sdk-nodejs-sms"
import type { EntityManager } from "typeorm"
import { PhoneSmsChallengeEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { WechatAuthService, type PhoneLoginResponse } from "./wechat-auth.service.js"
import { assertPhoneAuthHmacConfigured, hashPhone, hashPhoneAuthSource, hashSmsCode } from "./wechat-session-token.js"

export const SMS_COOLDOWN_MS = 60_000
export const SMS_TTL_MS = 5 * 60_000
export const SMS_MAX_ATTEMPTS = 5
const PHONE_PATTERN = /^1[3-9]\d{9}$/
const SMS_SOURCE_PER_MINUTE = 5
const SMS_SOURCE_PER_DAY = 50
const SMS_GLOBAL_PER_MINUTE = 30
const SMS_GLOBAL_PER_DAY = 500

export type WechatPhoneLoginInput = { readonly loginCode: string; readonly phoneCode: string }
export type SmsSendInput = { readonly phone: string }
export type SmsLoginInput = { readonly loginCode: string; readonly phone: string; readonly code: string }

@Injectable()
export class PhoneAuthService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(WechatAuthService) private readonly wechat: WechatAuthService,
  ) {}

  async wechatPhoneLogin(input: WechatPhoneLoginInput): Promise<PhoneLoginResponse> {
    assertPhoneAuthHmacConfigured()
    return this.wechat.loginWithWechatPhone(input.loginCode, input.phoneCode)
  }

  async sendSms(input: SmsSendInput, source: string): Promise<{ readonly ok: true; readonly retryAfterSeconds: number }> {
    assertSmsConfigured()
    assertPhoneAuthHmacConfigured()
    const phoneHash = hashPhone(input.phone)
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    const sourceHash = hashPhoneAuthSource(source)
    const dataSource = await this.database.getDataSource()
    await dataSource.transaction(async (manager) => {
      await consumeSmsSendLimit(manager, "global", SMS_GLOBAL_PER_MINUTE, SMS_GLOBAL_PER_DAY, new Date())
      await consumeSmsSendLimit(manager, sourceHash, SMS_SOURCE_PER_MINUTE, SMS_SOURCE_PER_DAY, new Date())
      await manager.query("INSERT INTO phone_sms_rate_limits (phone_hash, last_sent_at) VALUES (?, '1970-01-01 00:00:00.000000') ON DUPLICATE KEY UPDATE phone_hash = phone_hash", [phoneHash])
      const rows: readonly { readonly last_sent_at: Date | string }[] = await manager.query("SELECT last_sent_at FROM phone_sms_rate_limits WHERE phone_hash = ? FOR UPDATE", [phoneHash])
      const lastSentAt = rows[0]?.last_sent_at
      if (lastSentAt === undefined || Date.now() - new Date(lastSentAt).getTime() < SMS_COOLDOWN_MS) throw rateLimited("sms_rate_limited", "短信发送过于频繁")
      await manager.query("UPDATE phone_sms_rate_limits SET last_sent_at = NOW(6) WHERE phone_hash = ?", [phoneHash])
      await sendTencentSms(input.phone, code)
      await manager.save(PhoneSmsChallengeEntity, { id: makeId("phone-sms"), phoneHash, codeHash: hashSmsCode(phoneHash, code), attemptCount: 0, expiresAt: new Date(Date.now() + SMS_TTL_MS), consumedAt: null })
    })
    return { ok: true, retryAfterSeconds: SMS_COOLDOWN_MS / 1000 }
  }

  async smsLogin(input: SmsLoginInput): Promise<PhoneLoginResponse> {
    assertPhoneAuthHmacConfigured()
    const phoneHash = hashPhone(input.phone)
    const dataSource = await this.database.getDataSource()
    const result = await dataSource.transaction(async (manager) => {
      const challenge = await manager.getRepository(PhoneSmsChallengeEntity).findOne({ where: { phoneHash }, order: { createdAt: "DESC" }, lock: { mode: "pessimistic_write" } })
      if (challenge === null) return "expired" as const
      const decision = applySmsAttempt(challenge, hashSmsCode(phoneHash, input.code), new Date())
      if (decision === "invalid" || decision === "accepted") await manager.save(challenge)
      return decision
    })
    if (result === "expired") throw new UnauthorizedException({ code: "sms_code_expired", message: "短信验证码已过期" })
    if (result === "replayed") throw new UnauthorizedException({ code: "sms_code_replayed", message: "短信验证码已使用" })
    if (result === "exhausted") throw rateLimited("sms_code_attempts_exhausted", "验证码尝试次数已用尽")
    if (result === "invalid") throw new UnauthorizedException({ code: "sms_code_invalid", message: "短信验证码不正确" })
    return this.wechat.loginWithVerifiedPhone(input.loginCode, input.phone)
  }
}

export function smsVerificationDecision(challenge: PhoneSmsChallengeEntity, codeHash: string, now: Date): "expired" | "replayed" | "exhausted" | "invalid" | "accepted" {
  if (challenge.consumedAt !== null) return "replayed"
  if (challenge.expiresAt.getTime() <= now.getTime()) return "expired"
  if (challenge.attemptCount >= SMS_MAX_ATTEMPTS) return "exhausted"
  return challenge.codeHash === codeHash ? "accepted" : "invalid"
}

export function applySmsAttempt(challenge: PhoneSmsChallengeEntity, codeHash: string, now: Date): "expired" | "replayed" | "exhausted" | "invalid" | "accepted" {
  const decision = smsVerificationDecision(challenge, codeHash, now)
  if (decision === "invalid") challenge.attemptCount += 1
  if (decision === "accepted") challenge.consumedAt = now
  return decision
}

async function consumeSmsSendLimit(manager: EntityManager, limitKey: string, minuteLimit: number, dayLimit: number, now: Date): Promise<void> {
  await manager.query("INSERT INTO phone_sms_send_limits (limit_key, minute_started_at, minute_count, day_started_at, day_count) VALUES (?, '1970-01-01 00:00:00.000000', 0, '1970-01-01', 0) ON DUPLICATE KEY UPDATE limit_key = limit_key", [limitKey])
  const rows: readonly { readonly minute_started_at: Date | string; readonly minute_count: number; readonly day_started_at: Date | string; readonly day_count: number }[] = await manager.query("SELECT minute_started_at, minute_count, day_started_at, day_count FROM phone_sms_send_limits WHERE limit_key = ? FOR UPDATE", [limitKey])
  const row = rows[0]
  if (row === undefined) throw rateLimited("sms_rate_limited", "短信发送过于频繁")
  const minuteStartedAt = new Date(row.minute_started_at)
  const dayStartedAt = new Date(row.day_started_at)
  const minuteCount = now.getTime() - minuteStartedAt.getTime() < SMS_COOLDOWN_MS ? row.minute_count : 0
  const dayCount = now.toISOString().slice(0, 10) === dayStartedAt.toISOString().slice(0, 10) ? row.day_count : 0
  if (minuteCount >= minuteLimit || dayCount >= dayLimit) throw rateLimited("sms_rate_limited", "短信发送过于频繁")
  await manager.query("UPDATE phone_sms_send_limits SET minute_started_at = ?, minute_count = ?, day_started_at = ?, day_count = ? WHERE limit_key = ?", [minuteCount === 0 ? now : minuteStartedAt, minuteCount + 1, dayCount === 0 ? now.toISOString().slice(0, 10) : dayStartedAt.toISOString().slice(0, 10), dayCount + 1, limitKey])
}

export function parseWechatPhoneLoginInput(value: unknown): WechatPhoneLoginInput {
  const record = request(value)
  return { loginCode: code(record, "loginCode", 128), phoneCode: code(record, "phoneCode", 128) }
}

export function parseSmsSendInput(value: unknown): SmsSendInput {
  const phone = code(request(value), "phone", 11)
  if (!PHONE_PATTERN.test(phone)) throw invalid()
  return { phone }
}

export function parseSmsLoginInput(value: unknown): SmsLoginInput {
  const record = request(value)
  const phone = code(record, "phone", 11)
  const verificationCode = code(record, "code", 6)
  if (!PHONE_PATTERN.test(phone) || !/^\d{6}$/.test(verificationCode)) throw invalid()
  return { loginCode: code(record, "loginCode", 128), phone, code: verificationCode }
}

function request(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid()
  return Object.fromEntries(Object.entries(value))
}
function code(value: Record<string, unknown>, field: string, maximum: number): string {
  const item = value[field]
  if (typeof item !== "string" || item.length === 0 || item.length > maximum) throw invalid()
  return item
}
function invalid(): BadRequestException { return new BadRequestException({ code: "phone_auth_invalid", message: "手机认证请求不正确" }) }
function rateLimited(code: string, message: string): HttpException { return new HttpException({ code, message }, HttpStatus.TOO_MANY_REQUESTS) }

async function sendTencentSms(phone: string, code: string): Promise<void> {
  const secretId = required("TENCENT_CLOUD_SECRET_ID")
  const secretKey = required("TENCENT_CLOUD_SECRET_KEY")
  const sdkAppId = required("TENCENT_CLOUD_SMS_APP_ID")
  const signName = required("TENCENT_CLOUD_SMS_SIGN_NAME")
  const templateId = required("TENCENT_CLOUD_SMS_TEMPLATE_ID")
  const client = new sms.v20210111.Client({ credential: { secretId, secretKey }, region: process.env["TENCENT_CLOUD_REGION"] ?? "ap-shanghai" })
  const result = await client.SendSms({ SmsSdkAppId: sdkAppId, SignName: signName, TemplateId: templateId, TemplateParamSet: [code, "5"], PhoneNumberSet: [`+86${phone}`] })
  if (result.SendStatusSet?.[0]?.Code !== "Ok") throw new ConflictException({ code: "sms_send_failed", message: "短信服务拒绝发送" })
}
function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim().length === 0) throw new ServiceUnavailableException({ code: "sms_unconfigured", message: "短信服务尚未配置" })
  return value
}

export function assertSmsConfigured(): void {
  required("TENCENT_CLOUD_SECRET_ID")
  required("TENCENT_CLOUD_SECRET_KEY")
  required("TENCENT_CLOUD_SMS_APP_ID")
  required("TENCENT_CLOUD_SMS_SIGN_NAME")
  required("TENCENT_CLOUD_SMS_TEMPLATE_ID")
}
