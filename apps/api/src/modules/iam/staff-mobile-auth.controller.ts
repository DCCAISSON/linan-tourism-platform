import { Body, Controller, ForbiddenException, Headers, HttpCode, Inject, Post } from "@nestjs/common"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "./dev-staff-access.service.js"
import { parseLogin, parsePasswordChange } from "./staff-auth.parser.js"
import { StaffAuthService } from "./staff-auth.service.js"
import { assertMobilePasswordRequest, readMobileStaffToken } from "./staff-mobile-transport.js"

type StaffMobileLoginResponse = {
  readonly token: string
  readonly expiresAt: string
  readonly account: {
    readonly id: string
    readonly username: string
    readonly displayName: string
    readonly forcePasswordChange: boolean
  }
}

@Controller("staff/mobile/auth")
export class StaffMobileAuthController {
  constructor(
    @Inject(StaffAuthService) private readonly auth: StaffAuthService,
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown): Promise<StaffMobileLoginResponse> {
    assertMobilePasswordRequest(headers)
    const input = parseLogin(body)
    const result = await this.auth.login(input.username, input.password)
    const access = await this.access.resolve({ authorization: `Staff ${result.token}` }, { allowPasswordChange: true })
    if (!access.permissionKeys.has("execution.read")) {
      await this.auth.logout(result.token)
      throw new ForbiddenException({ code: "staff_scope_forbidden", message: "staff identity cannot access guide workspace" })
    }
    return {
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      account: { id: result.account.id, username: result.account.username, displayName: result.account.displayName, forcePasswordChange: result.account.forcePasswordChange },
    }
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Headers() headers: StaffAccessRequestHeaders): Promise<{ readonly ok: true }> {
    const token = readMobileStaffToken(headers)
    await this.access.resolve(headers, { allowPasswordChange: true })
    await this.auth.logout(token)
    return { ok: true }
  }

  @Post("change-password")
  @HttpCode(200)
  async changePassword(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown): Promise<{ readonly ok: true }> {
    assertMobilePasswordRequest(headers)
    const input = parsePasswordChange(body)
    await this.auth.changePassword(input.username, input.currentPassword, input.newPassword)
    return { ok: true }
  }
}
