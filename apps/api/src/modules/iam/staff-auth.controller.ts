import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res } from "@nestjs/common"
import type { Response } from "express"
import {
  parseCreateStaffAccount,
  parseLogin,
  parsePasswordChange,
  parseTemporaryPassword,
} from "./staff-auth.parser.js"
import {
  StaffAuthService,
  type StaffAccountSummary,
} from "./staff-auth.service.js"
import {
  DevStaffAccessService,
  type StaffAccess,
} from "./dev-staff-access.service.js"
import { STAFF_SESSION_COOKIE } from "./staff-session-token.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("staff")
export class StaffAuthController {
  constructor(
    @Inject(StaffAuthService) private readonly auth: StaffAuthService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  @Post("auth/login")
  @HttpCode(200)
  async login(@Headers() headers: RequestHeaders, @Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<StaffAccountSummary> {
    this.staffAccess.assertUnsafeOrigin(headers)
    const input = parseLogin(body)
    const result = await this.auth.login(input.username, input.password)
    response.setHeader("Set-Cookie", serializeStaffCookie(result.token, result.expiresAt))
    return {
      id: result.account.id,
      username: result.account.username,
      displayName: result.account.displayName,
      status: result.account.status,
      forcePasswordChange: result.account.forcePasswordChange,
      expiresAt: result.account.expiresAt?.toISOString() ?? null,
      permissionKeys: [],
      scopes: [],
    }
  }

  @Post("auth/logout")
  @HttpCode(200)
  async logout(@Headers() headers: RequestHeaders, @Res({ passthrough: true }) response: Response): Promise<{ readonly ok: true }> {
    this.staffAccess.assertUnsafeOrigin(headers)
    await this.auth.logout(readCookie(headers, STAFF_SESSION_COOKIE))
    response.setHeader("Set-Cookie", clearStaffCookie())
    return { ok: true }
  }

  @Post("auth/change-password")
  @HttpCode(200)
  async changePassword(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<{ readonly ok: true }> {
    this.staffAccess.assertUnsafeOrigin(headers)
    const input = parsePasswordChange(body)
    await this.auth.changePassword(input.username, input.currentPassword, input.newPassword)
    return { ok: true }
  }

  @Get("auth/me")
  async me(@Headers() headers: RequestHeaders): Promise<StaffAccessResponse> {
    return serializeAccess(await this.staffAccess.resolve(headers, { allowPasswordChange: true }))
  }

  @Get("accounts")
  async listAccounts(@Headers() headers: RequestHeaders): Promise<readonly StaffAccountSummary[]> {
    const access = await this.staffAccess.resolve(headers)
    this.staffAccess.assertStaffAccountManagement(access)
    return await this.auth.listAccounts(access)
  }

  @Post("accounts")
  @HttpCode(200)
  async createAccount(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<StaffAccountSummary> {
    this.staffAccess.assertUnsafeOrigin(headers)
    const access = await this.staffAccess.resolve(headers)
    this.staffAccess.assertStaffAccountManagement(access)
    return await this.auth.createAccount(access, parseCreateStaffAccount(body))
  }

  @Post("accounts/:id/reset-password")
  @HttpCode(200)
  async resetPassword(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<StaffAccountSummary> {
    this.staffAccess.assertUnsafeOrigin(headers)
    const access = await this.staffAccess.resolve(headers)
    this.staffAccess.assertStaffAccountManagement(access)
    return await this.auth.resetPassword(access, id, parseTemporaryPassword(body))
  }

  @Post("accounts/:id/disable")
  @HttpCode(200)
  async disableAccount(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<StaffAccountSummary> {
    this.staffAccess.assertUnsafeOrigin(headers)
    const access = await this.staffAccess.resolve(headers)
    this.staffAccess.assertStaffAccountManagement(access)
    return await this.auth.disableAccount(access, id)
  }
}

function serializeStaffCookie(token: string, expiresAt: Date): string {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : ""
  return `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200; Expires=${expiresAt.toUTCString()}${secure}`
}

function clearStaffCookie(): string {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : ""
  return `${STAFF_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
}

function readCookie(headers: RequestHeaders, name: string): string | undefined {
  const cookie = headers["cookie"]
  if (typeof cookie !== "string") {
    return undefined
  }
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=")
    if (rawName === name) {
      const value = rawValue.join("=")
      return value.length > 0 ? decodeURIComponent(value) : undefined
    }
  }
  return undefined
}

type StaffAccessResponse = Omit<StaffAccess, "permissionKeys"> & {
  readonly permissionKeys: readonly string[]
}

function serializeAccess(access: StaffAccess): StaffAccessResponse {
  return {
    ...access,
    permissionKeys: [...access.permissionKeys],
  }
}
