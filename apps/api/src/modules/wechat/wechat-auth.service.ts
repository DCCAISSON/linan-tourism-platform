import { BadGatewayException, BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { FamilyEntity, WechatFamilySessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { createWechatSessionToken, hashWechatIdentity, hashWechatSessionToken, WECHAT_SESSION_TTL_MS } from "./wechat-session-token.js"

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
      const familyCode = await this.resolveFamilyCode(manager, hashes.openidHash, input.familyCode)
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
      const active = await findActiveSession(manager, hashes.openidHash)
      if (active !== null && active.familyCode !== targetFamilyCode) {
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
      await manager.update(WechatFamilySessionEntity, { openidHash: current.openidHash, revokedAt: null }, { revokedAt: new Date() })
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
    if (family === null) {
      throw new UnauthorizedException({ code: "wechat_family_unbound", message: "wechat family is not bound" })
    }
    const token = createWechatSessionToken()
    const expiresAt = new Date(Date.now() + WECHAT_SESSION_TTL_MS)
    await manager.save(WechatFamilySessionEntity, {
      id: makeId("wechat-session"),
      organizationId: family.organizationId,
      familyId: family.id,
      familyCode: family.code,
      openidHash: hashes.openidHash,
      unionidHash: hashes.unionidHash,
      tokenHash: hashWechatSessionToken(token),
      expiresAt,
      revokedAt: null,
    })
    return { token, familyCode: family.code, expiresAt: expiresAt.toISOString() }
  }

  private async resolveFamilyCode(manager: EntityManager, openidHash: string, suppliedFamilyCode: string | null): Promise<string> {
    const active = await findActiveSession(manager, openidHash)
    if (active !== null) return active.familyCode
    if (process.env["NODE_ENV"] !== "production" && suppliedFamilyCode !== null) return suppliedFamilyCode
    const configured = process.env["WECHAT_DEV_LOGIN_FAMILY_CODE"]
    if (process.env["NODE_ENV"] !== "production" && configured !== undefined && configured.length > 0) return configured
    throw new UnauthorizedException({ code: "wechat_family_unbound", message: "wechat family is not bound" })
  }

  private async resolveBearerSession(headers: Record<string, string | readonly string[] | undefined>): Promise<WechatFamilySessionEntity> {
    const token = readBearer(headers)
    if (token === undefined) throw new UnauthorizedException({ code: "identity_required", message: "wechat session is required" })
    const dataSource = await this.database.getDataSource()
    const session = await dataSource.getRepository(WechatFamilySessionEntity).findOneBy({ tokenHash: hashWechatSessionToken(token) })
    if (session !== null && session.revokedAt === null && session.expiresAt.getTime() > Date.now()) return session
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

async function findActiveSession(manager: EntityManager, openidHash: string): Promise<WechatFamilySessionEntity | null> {
  const active = await manager.findOne(WechatFamilySessionEntity, { where: { openidHash }, order: { createdAt: "DESC" } })
  return active !== null && active.revokedAt === null && active.expiresAt.getTime() > Date.now() ? active : null
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
  const secret = process.env["WECHAT_MINIAPP_SECRET"]
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
