import { UnauthorizedException } from "@nestjs/common"
import type { StaffAccessRequestHeaders } from "./dev-staff-access.service.js"

export function assertMobileTransport(headers: StaffAccessRequestHeaders): void {
  if (headers["cookie"] !== undefined || headers["origin"] !== undefined || Object.keys(headers).some(key => key.startsWith("x-linan-dev-"))) {
    throw new UnauthorizedException({ code: "staff_identity_required", message: "native staff credentials must be supplied separately" })
  }
}

export function readMobileStaffToken(headers: StaffAccessRequestHeaders): string {
  assertMobileTransport(headers)
  const authorization = headers["authorization"]
  if (typeof authorization !== "string" || !/^Staff [A-Za-z0-9_-]{43}$/.test(authorization)) {
    throw new UnauthorizedException({ code: "staff_identity_required", message: "native staff session is required" })
  }
  return authorization.slice("Staff ".length)
}

export function assertMobilePasswordRequest(headers: StaffAccessRequestHeaders): void {
  assertMobileTransport(headers)
  if (headers["authorization"] !== undefined) {
    throw new UnauthorizedException({ code: "staff_identity_required", message: "password requests must not include session credentials" })
  }
}
