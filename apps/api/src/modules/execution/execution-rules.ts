import { ForbiddenException } from "@nestjs/common"
import { assertTravelerActionable } from "../travelers/travelers.read-model.js"
import type { TravelerRecord } from "../travelers/travelers.types.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { AttendanceStatus } from "./execution.types.js"

export function assertAttendanceTravelerWritable(traveler: TravelerRecord, status: AttendanceStatus): void {
  if (status !== "revoked") assertTravelerActionable(traveler)
}

export function assertHealthReadable<T extends { readonly revokedAt: Date | null }>(access: StaffAccess, authorization: T | null): asserts authorization is T & { readonly revokedAt: null } {
  if (!access.permissionKeys.has("health.read")) throw new ForbiddenException({ code: "health_read_forbidden", message: "无权读取健康原文" })
  if (authorization === null || authorization.revokedAt !== null) throw new ForbiddenException({ code: "execution_forbidden", message: "家长未授权或已撤回健康信息" })
}
