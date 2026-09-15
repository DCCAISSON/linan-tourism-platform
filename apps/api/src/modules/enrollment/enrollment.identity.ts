import { Injectable, UnauthorizedException } from "@nestjs/common"
import type { EnrollmentIdentity } from "./enrollment.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

const DEV_FAMILY_HEADER = "x-linan-dev-family-identity"
const LEGACY_TEST_FAMILY_HEADER = "x-linan-family-id"

@Injectable()
export class EnrollmentIdentityService {
  resolve(headers: RequestHeaders): EnrollmentIdentity {
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
