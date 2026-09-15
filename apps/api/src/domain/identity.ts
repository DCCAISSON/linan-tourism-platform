import {
  DOMAIN_ERROR_CODE,
  DOMAIN_POLICY_VERSION,
  type DomainContractError,
  type Result,
} from "@linan/contracts"
import { randomUUID } from "node:crypto"

type MiniappSession = {
  readonly openid: string
  readonly sessionKey: string
}

type WxCode2SessionRequest = {
  readonly appId: string
  readonly appSecret: string
  readonly loginCode: string
}

export type WxCode2SessionTransport = (request: WxCode2SessionRequest) => Promise<MiniappSession>

export type MiniappIdentityAdapter = {
  readonly exchangeLoginCode: (
    loginCode: string,
  ) => Promise<Result<MiniappSession, DomainContractError>>
}

export type StaffSessionStore = {
  readonly admins: Set<string>
  readonly revokedSessions: Set<string>
  readonly staffSessions: Map<string, string>
}

function identityError(message: string): DomainContractError {
  return {
    code: DOMAIN_ERROR_CODE.provisionalPolicyViolation,
    message,
    policyVersion: DOMAIN_POLICY_VERSION,
  }
}

export function createDevelopmentMiniappIdentityAdapter(): MiniappIdentityAdapter {
  return {
    async exchangeLoginCode(loginCode) {
      return {
        ok: true,
        value: {
          openid: `dev-miniapp-${loginCode}`,
          sessionKey: "development-session",
        },
      }
    },
  }
}

export function createWxCode2SessionIdentityAdapter(
  transport: WxCode2SessionTransport,
): MiniappIdentityAdapter {
  return {
    async exchangeLoginCode(loginCode) {
      const appId = process.env["WECHAT_MINIAPP_APP_ID"]
      const appSecret = process.env["WECHAT_MINIAPP_APP_SECRET"]

      if (appId === undefined || appSecret === undefined) {
        return { ok: false, error: identityError("wx miniapp env is incomplete") }
      }

      return {
        ok: true,
        value: await transport({ appId, appSecret, loginCode }),
      }
    },
  }
}

export function createStaffSessionManager(store: StaffSessionStore) {
  return {
    create(openid: string): string {
      const sessionId = randomUUID()
      store.staffSessions.set(sessionId, openid)
      return sessionId
    },
    revoke(sessionId: string): void {
      store.revokedSessions.add(sessionId)
    },
    verify(sessionId: string): Result<string, DomainContractError> {
      const openid = store.staffSessions.get(sessionId)

      if (openid === undefined || store.revokedSessions.has(sessionId)) {
        return { ok: false, error: identityError("staff session is revoked or missing") }
      }

      return { ok: true, value: openid }
    },
  }
}

export function createProductionAdminBootstrap(
  store: StaffSessionStore,
): (providedToken: string) => Result<string, DomainContractError> {
  return (providedToken) => {
    const adminOpenid = process.env["PRODUCTION_ADMIN_OPENID"]
    const bootstrapToken = process.env["PRODUCTION_ADMIN_BOOTSTRAP_TOKEN"]

    if (!adminOpenid || !bootstrapToken) {
      return { ok: false, error: identityError("production admin env is missing") }
    }

    if (providedToken !== bootstrapToken) {
      return { ok: false, error: identityError("production admin bootstrap token is invalid") }
    }

    if (store.admins.size > 0) {
      return { ok: false, error: identityError("production admin already bootstrapped") }
    }

    store.admins.add(adminOpenid)
    return { ok: true, value: adminOpenid }
  }
}
