import { Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import { WechatFamilySessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "./enrollment.types.js"
import { hashWechatSessionToken } from "../wechat/wechat-session-token.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

const DEV_FAMILY_HEADER = "x-linan-dev-family-identity"
const LEGACY_TEST_FAMILY_HEADER = "x-linan-family-id"

@Injectable()
export class EnrollmentIdentityService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async resolve(headers: RequestHeaders): Promise<EnrollmentIdentity> {
    const token = readBearer(headers)
    if (token !== undefined) {
      const dataSource = await this.database.getDataSource()
      const session = await dataSource.getRepository(WechatFamilySessionEntity).findOneBy({ tokenHash: hashWechatSessionToken(token) })
      if (session !== null && session.revokedAt === null && session.expiresAt.getTime() > Date.now()) {
        return { familyCode: session.familyCode, actorId: session.openidHash }
      }
      throw new UnauthorizedException({ code: "identity_required", message: "wechat session is expired" })
    }

    if (process.env["NODE_ENV"] === "production") {
      throw new UnauthorizedException({
        code: "identity_unavailable",
        message: "wx identity provider is not configured for enrollment yet",
      })
    }

    const familyHeader = readHeader(headers, DEV_FAMILY_HEADER) ?? readHeader(headers, LEGACY_TEST_FAMILY_HEADER)
    if (familyHeader === undefined || familyHeader.length === 0 || familyHeader.length > 64) {
      throw new UnauthorizedException({
        code: "identity_required",
        message: "family identity is required",
      })
    }

    return { familyCode: familyHeader, actorId: familyHeader }
  }
}

function readHeader(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === "string" ? value : undefined
}

function readBearer(headers: RequestHeaders): string | undefined {
  const value = readHeader(headers, "authorization") ?? readHeader(headers, "Authorization")
  if (value === undefined) return undefined
  const prefix = "Bearer "
  return value.startsWith(prefix) && value.length > prefix.length ? value.slice(prefix.length) : undefined
}
