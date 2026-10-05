import { BadGatewayException, BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { FamilyEntity, WechatFamilySessionEntity, WechatIdentityEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { createWechatSessionToken, hashPhone, hashWechatIdentity, hashWechatSessionToken, WECHAT_SESSION_TTL_MS } from "./wechat-session-token.js"
import { recordRequestActor } from "../../request-observability.js"

type Code2SessionResponse = {
  readonly openid: string
  readonly unionid: string | null
  readonly sessionKey: string | null
}

export type WechatLoginInput = {
  readonly code: string
  readonly familyCode: string | null
}

export type WechatLoginResponse = {
  readonly token: string
  readonly familyCode: string
  readonly expiresAt: string
}

@Injectable()
export class WechatAuthService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async login(input: WechatLoginInput): Promise<WechatLoginResponse> {
    const session = await exchangeCode2Session(input.code)
    const hashes = toWechatIdentityHashes(session)
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const familyCode = await this.resolveFamilyCode(manager, hashes.openidHash)
      return this.createSession(manager, familyCode, hashes)
    })
  }

  async bind(input: WechatLoginInput): Promise<WechatLoginResponse> {
    if (input.familyCode === null) {
      throw new BadRequestException({ code: "wechat_family_code_required", message: "wechat family code is required" })
    }
    const targetFamilyCode = input.familyCode
    const session = await exchangeCode2Session(input.code)
    const hashes = toWechatIdentityHashes(session)
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const familyCode = await this.resolveFamilyCode(manager, hashes.openidHash)
      if (familyCode !== targetFamilyCode) {
        throw new UnauthorizedException({ code: "wechat_family_already_bound", message: "wechat identity is already bound to another family" })
      }
      return this.createSession(manager, targetFamilyCode, hashes)
    })
  }

  async rebind(headers: Record<string, string | readonly string[] | undefined>, input: WechatLoginInput): Promise<WechatLoginResponse> {
    if (input.familyCode === null) {
      throw new BadRequestException({ code: "wechat_family_code_required", message: "wechat family code is required" })
    }
    const targetFamilyCode = input.familyCode
    const current = await this.resolveBearerSession(headers)
    const session = await exchangeCode2Session(input.code)
    const hashes = toWechatIdentityHashes(session)
    if (hashes.openidHash !== current.openidHash) {
      throw new UnauthorizedException({ code: "wechat_identity_mismatch", message: "wechat code does not match the current session" })
    }
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const familyCode = await this.resolveFamilyCode(manager, hashes.openidHash)
      if (familyCode !== targetFamilyCode) {
        throw new UnauthorizedException({ code: "wechat_family_already_bound", message: "wechat identity is already bound to another family" })
      }
      await manager.update(WechatFamilySessionEntity, { openidHash: current.openidHash }, { revokedAt: new Date() })
      return this.createSession(manager, targetFamilyCode, hashes)
    })
  }

  async logout(headers: Record<string, string | readonly string[] | undefined>): Promise<{ readonly ok: true }> {
    const current = await this.resolveBearerSession(headers)
    const dataSource = await this.database.getDataSource()
    await dataSource.getRepository(WechatFamilySessionEntity).update({ id: current.id }, { revokedAt: new Date() })
    return { ok: true }
  }

  async resolvePaymentOpenid(headers: Record<string, string | readonly string[] | undefined>, code: string): Promise<string> {
    const current = await this.resolveBearerSession(headers)
    const session = await exchangeCode2Session(code)
    if (hashWechatIdentity(session.openid) !== current.openidHash) {
      throw new UnauthorizedException({ code: "wechat_identity_mismatch", message: "wechat code does not match the current session" })
    }
    return session.openid
  }

  private async createSession(manager: EntityManager, familyCode: string, hashes: WechatIdentityHashes): Promise<WechatLoginResponse> {
    const family = await manager.findOneBy(FamilyEntity, { code: familyCode })
    const token = createWechatSessionToken()
    const expiresAt = new Date(Date.now() + WECHAT_SESSION_TTL_MS)
    await manager.save(WechatFamilySessionEntity, {
      id: makeId("wechat-session"),
      organizationId: family?.organizationId ?? null,
      familyId: family?.id ?? null,
      familyCode,
      openidHash: hashes.openidHash,
      unionidHash: hashes.unionidHash,
      tokenHash: hashWechatSessionToken(token),
      phoneHash: null,
      phoneVerified: false,
      expiresAt,
      revokedAt: null,
    })
    recordRequestActor(hashes.openidHash)
    return { token, familyCode, expiresAt: expiresAt.toISOString() }
  }

  private async createVerifiedPhoneSession(session: Code2SessionResponse, phone: string): Promise<PhoneLoginResponse> {
    const hashes = toWechatIdentityHashes(session)
    const phoneHash = hashPhone(phone)
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const familyCode = await this.resolveFamilyCode(manager, hashes.openidHash)
      await manager.query("INSERT INTO phone_identities (phone_hash, family_code) VALUES (?, ?) ON DUPLICATE KEY UPDATE phone_hash = phone_hash", [phoneHash, familyCode])
      const rows: readonly { readonly family_code: string }[] = await manager.query("SELECT family_code FROM phone_identities WHERE phone_hash = ?", [phoneHash])
      if (!sameFamilyCode(rows[0]?.family_code, familyCode)) throw new UnauthorizedException({ code: "phone_identity_conflict", message: "手机号已绑定其他家庭身份" })
      const family = await manager.findOneBy(FamilyEntity, { code: familyCode })
      const token = createWechatSessionToken()
      const expiresAt = new Date(Date.now() + WECHAT_SESSION_TTL_MS)
      await manager.save(WechatFamilySessionEntity, { id: makeId("wechat-session"), organizationId: family?.organizationId ?? null, familyId: family?.id ?? null, familyCode, openidHash: hashes.openidHash, unionidHash: hashes.unionidHash, tokenHash: hashWechatSessionToken(token), phoneHash, phoneVerified: true, expiresAt, revokedAt: null })
      recordRequestActor(hashes.openidHash)
      return { token, familyCode, expiresAt: expiresAt.toISOString(), phoneVerified: true }
    })
  }

  private async resolveFamilyCode(manager: EntityManager, openidHash: string): Promise<string> {
    await manager.query(
      "INSERT INTO wechat_identities (openid_hash, family_code) VALUES (?, ?) ON DUPLICATE KEY UPDATE openid_hash = openid_hash",
      [openidHash, makeId("consumer")],
    )
    const identity = await manager.findOneByOrFail(WechatIdentityEntity, { openidHash })
    return identity.familyCode
  }

  async loginWithWechatPhone(loginCode: string, phoneCode: string): Promise<PhoneLoginResponse> {
    return this.createVerifiedPhoneSession(await exchangeCode2Session(loginCode), await exchangeWechatPhone(phoneCode))
  }

  async loginWithVerifiedPhone(loginCode: string, phone: string): Promise<PhoneLoginResponse> {
    return this.createVerifiedPhoneSession(await exchangeCode2Session(loginCode), phone)
  }

  private async resolveBearerSession(headers: Record<string, string | readonly string[] | undefined>): Promise<WechatFamilySessionEntity> {
    const token = readBearer(headers)
    if (token === undefined) throw new UnauthorizedException({ code: "identity_required", message: "wechat session is required" })
    const dataSource = await this.database.getDataSource()
    const session = await dataSource.getRepository(WechatFamilySessionEntity).findOneBy({ tokenHash: hashWechatSessionToken(token) })
    if (session !== null && session.revokedAt === null && session.expiresAt.getTime() > Date.now()) {
      recordRequestActor(session.openidHash)
      return session
    }
    throw new UnauthorizedException({ code: "identity_required", message: "wechat session is expired" })
  }
}

type WechatIdentityHashes = {
  readonly openidHash: string
  readonly unionidHash: string | null
}

function toWechatIdentityHashes(session: Code2SessionResponse): WechatIdentityHashes {
  return { openidHash: hashWechatIdentity(session.openid), unionidHash: session.unionid === null ? null : hashWechatIdentity(session.unionid) }
}

function readHeader(headers: Record<string, string | readonly string[] | undefined>, name: string): string | undefined {
  const value = headers[name]
  return typeof value === "string" ? value : undefined
}

function readBearer(headers: Record<string, string | readonly string[] | undefined>): string | undefined {
  const value = readHeader(headers, "authorization") ?? readHeader(headers, "Authorization")
  const prefix = "Bearer "
  return value !== undefined && value.startsWith(prefix) && value.length > prefix.length ? value.slice(prefix.length) : undefined
}

export async function exchangeCode2Session(code: string): Promise<Code2SessionResponse> {
  const appId = process.env["WECHAT_MINIAPP_APP_ID"]
  const secret = process.env["WECHAT_MINIAPP_APP_SECRET"]
  if (appId === undefined || secret === undefined || appId.length === 0 || secret.length === 0) {
    throw new BadRequestException({ code: "wechat_login_unconfigured", message: "wechat miniapp credentials are not configured" })
  }
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session")
  url.searchParams.set("appid", appId)
  url.searchParams.set("secret", secret)
  url.searchParams.set("js_code", code)
  url.searchParams.set("grant_type", "authorization_code")
  const response = await fetch(url)
  const value = await response.json()
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadGatewayException({ code: "wechat_code2session_invalid", message: "wechat code2Session response is invalid" })
  }
  const record = Object.fromEntries(Object.entries(value))
  if (typeof record["errcode"] === "number" && record["errcode"] !== 0) {
    throw new UnauthorizedException({ code: "wechat_code_invalid", message: "wechat login code is invalid" })
  }
  const openid = record["openid"]
  if (typeof openid !== "string" || openid.length === 0) {
    throw new BadGatewayException({ code: "wechat_code2session_invalid", message: "wechat code2Session response is invalid" })
  }
  return {
    openid,
    unionid: typeof record["unionid"] === "string" && record["unionid"].length > 0 ? record["unionid"] : null,
    sessionKey: typeof record["session_key"] === "string" && record["session_key"].length > 0 ? record["session_key"] : null,
  }
}

export type PhoneLoginResponse = WechatLoginResponse & { readonly phoneVerified: true }

export function sameFamilyCode(phoneFamilyCode: string | undefined, openidFamilyCode: string): boolean {
  return phoneFamilyCode === openidFamilyCode
}

export async function exchangeWechatPhone(phoneCode: string): Promise<string> {
  const appId = process.env["WECHAT_MINIAPP_APP_ID"]
  const secret = process.env["WECHAT_MINIAPP_APP_SECRET"]
  if (appId === undefined || secret === undefined || appId.length === 0 || secret.length === 0) throw new BadRequestException({ code: "wechat_login_unconfigured", message: "wechat miniapp credentials are not configured" })
  const tokenUrl = new URL("https://api.weixin.qq.com/cgi-bin/token")
  tokenUrl.searchParams.set("grant_type", "client_credential")
  tokenUrl.searchParams.set("appid", appId)
  tokenUrl.searchParams.set("secret", secret)
  const tokenValue: unknown = await (await fetch(tokenUrl)).json()
  if (typeof tokenValue !== "object" || tokenValue === null || Array.isArray(tokenValue)) throw new BadGatewayException({ code: "wechat_phone_invalid", message: "wechat phone response is invalid" })
  const tokenRecord = Object.fromEntries(Object.entries(tokenValue))
  const accessToken = tokenRecord["access_token"]
  if (typeof accessToken !== "string") throw new BadGatewayException({ code: "wechat_phone_invalid", message: "wechat phone response is invalid" })
  const phoneUrl = new URL("https://api.weixin.qq.com/wxa/business/getuserphonenumber")
  phoneUrl.searchParams.set("access_token", accessToken)
  const phoneValue: unknown = await (await fetch(phoneUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: phoneCode }) })).json()
  if (typeof phoneValue !== "object" || phoneValue === null || Array.isArray(phoneValue)) throw new BadGatewayException({ code: "wechat_phone_invalid", message: "wechat phone response is invalid" })
  const phoneInfo = Object.fromEntries(Object.entries(phoneValue))["phone_info"]
  if (typeof phoneInfo !== "object" || phoneInfo === null || Array.isArray(phoneInfo) || typeof phoneInfo.phoneNumber !== "string" || !/^1[3-9]\d{9}$/.test(phoneInfo.phoneNumber)) throw new UnauthorizedException({ code: "wechat_phone_invalid", message: "wechat phone code is invalid" })
  return phoneInfo.phoneNumber
}

export function parseWechatLoginInput(value: unknown): WechatLoginInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException({ code: "wechat_login_invalid", message: "wechat login input is invalid" })
  }
  const record = Object.fromEntries(Object.entries(value))
  const code = record["code"]
  const familyCode = record["familyCode"]
  if (typeof code !== "string" || code.length === 0 || code.length > 128) {
    throw new BadRequestException({ code: "wechat_login_invalid", message: "wechat login code is invalid" })
  }
  if (familyCode !== undefined && (typeof familyCode !== "string" || familyCode.length === 0 || familyCode.length > 64)) {
    throw new BadRequestException({ code: "wechat_login_invalid", message: "wechat family code is invalid" })
  }
  return { code, familyCode: typeof familyCode === "string" ? familyCode : null }
}
