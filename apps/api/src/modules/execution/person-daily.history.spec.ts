import { ConflictException, ForbiddenException } from "@nestjs/common"
import { DataSource } from "typeorm"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExecutionPersonDailyReportEntity } from "../../domain/entities/execution-person-daily-report.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { ExecutionAccessService } from "./execution-access.service.js"
import * as confirmed from "./execution-confirmed-person.js"
import { PersonDailyService } from "./person-daily.service.js"

const managerAccess: StaffAccess = { actorId: "manager", kind: "guide", forcePasswordChange: false, permissionKeys: new Set(["execution.read", "execution.manage"]), scopes: [{ kind: "tour_session", id: "session" }] }

function setup(displayName: string | null = "带队老师") {
  const source = new DataSource({ type: "mysql", host: "unused", database: "unused" })
  const database = new ConfigurationDatabaseService()
  vi.spyOn(database, "getDataSource").mockResolvedValue(source)
  const access = new ExecutionAccessService(database)
  const scope = vi.spyOn(access, "session").mockResolvedValue(Object.assign(new TourSessionEntity(), { id: "session" }))
  const active = vi.spyOn(access, "requireActiveAccount").mockResolvedValue(new StaffAccountEntity())
  const confirmation = vi.spyOn(confirmed, "readConfirmedPerson").mockRejectedValue(new ConflictException("当前名单已失效"))
  const report = Object.assign(new ExecutionPersonDailyReportEntity(), { id: "daily", tourSessionId: "session", personRef: "paid:person", breakfast: "recorded", encryptedNote: "private-ciphertext", encryptedBodyStatus: "private-body", updatedBy: "guide" })
  vi.spyOn(source.manager, "findOneBy").mockResolvedValue(report)
  vi.spyOn(source.manager, "find").mockResolvedValueOnce([]).mockResolvedValue(displayName === null ? [] : [Object.assign(new StaffAccountEntity(), { id: "guide", displayName })])
  return { service: new PersonDailyService(database, access, new AuditLogService()), scope, active, confirmation }
}

describe("person daily historical authority", () => {
  afterEach(() => vi.restoreAllMocks())

  it("lets an active scoped execution manager review old facts regardless of inferred guide kind", async () => {
    // Given a manager classified as guide and a stale current confirmation.
    const { service, scope, active, confirmation } = setup()
    // When reading the existing report without persisted revisions.
    const history = await service.history(managerAccess, { sessionId: "session", reportId: "daily" })
    // Then legacy facts remain readable with current account/scope checks and no private body.
    expect(history).toEqual([expect.objectContaining({ reportId: "daily", breakfast: "recorded", correctionReason: "历史记录", recordedBy: "guide", recordedByName: "带队老师" })])
    expect(scope).toHaveBeenCalled()
    expect(active).toHaveBeenCalled()
    expect(confirmation).not.toHaveBeenCalled()
    expect(JSON.stringify(history)).not.toContain("private")
  })

  it("still requires the current person assignment for a guide without management permission", async () => {
    // Given an ordinary guide and a stale current confirmation.
    const { service } = setup()
    const guide: StaffAccess = { ...managerAccess, permissionKeys: new Set(["execution.read"]) }
    // When reading history; then the current person authority remains required.
    await expect(service.history(guide, { sessionId: "session", reportId: "daily" })).rejects.toThrow(ConflictException)
  })

  it("rejects a manager whose account is no longer active", async () => {
    // Given revoked account access despite management permission.
    const { service, active } = setup()
    active.mockRejectedValue(new ForbiddenException("工作人员账号已失效"))
    // When reading history; then no historical facts are returned.
    await expect(service.history(managerAccess, { sessionId: "session", reportId: "daily" })).rejects.toThrow(ForbiddenException)
  })

  it("uses a readable fallback when the historical staff account cannot be found", async () => {
    const { service } = setup(null)
    const history = await service.history(managerAccess, { sessionId: "session", reportId: "daily" })
    expect(history[0]).toMatchObject({ recordedBy: "guide", recordedByName: "工作人员" })
  })
})
