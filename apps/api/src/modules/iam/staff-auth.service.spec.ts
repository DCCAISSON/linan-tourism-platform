import { describe, expect, it, vi } from "vitest"
import {
  StaffAccountEntity,
  StaffAccountPermissionEntity,
  StaffAccountScopeEntity,
} from "../../domain/entities/index.js"
import type { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { AuditLogService } from "./audit-log.service.js"
import { recordStaffAccountAudit } from "./staff-auth-audit.js"
import { StaffAuthService } from "./staff-auth.service.js"
import type { StaffAccess } from "./dev-staff-access.service.js"

describe("StaffAuthService account lifecycle audit", () => {
  it("records the acting administrator when creating, resetting, and disabling a target account", async () => {
    const target = new StaffAccountEntity()
    target.id = "staff-target"
    target.username = "target"
    target.displayName = "Target"
    target.status = "active"
    target.forcePasswordChange = false
    target.expiresAt = null
    target.failedLoginAttempts = 0
    target.lockedUntil = null
    target.permissionsVersion = 1

    const auditRecords: unknown[] = []
    const dataSource = {
      manager: {
        findOne: vi.fn().mockResolvedValue({ id: "org-1" }),
        findOneBy: vi.fn().mockResolvedValue(null),
      },
      transaction: vi.fn(async (callback: (manager: { save: (value: unknown) => Promise<unknown> }) => Promise<void>) => {
        await callback({ save: vi.fn(async (value: unknown) => value) })
      }),
      getRepository: vi.fn((entity: unknown) => {
        if (entity === StaffAccountEntity) {
          return {
            findOneBy: vi.fn().mockResolvedValue(target),
            save: vi.fn(async (account: StaffAccountEntity) => account),
          }
        }
        if (entity === StaffAccountPermissionEntity) {
          return {
            findBy: vi.fn().mockResolvedValue([{ permissionKey: "workbench.read" }]),
          }
        }
        if (entity === StaffAccountScopeEntity) {
          return {
            findBy: vi.fn().mockResolvedValue([{ scopeKind: "organization", scopeId: "org-1" }]),
          }
        }
        throw new Error("unexpected repository")
      }),
    }
    const service = new StaffAuthService(
      { getDataSource: vi.fn().mockResolvedValue(dataSource) } as unknown as ConfigurationDatabaseService,
      { record: vi.fn(async (_manager: unknown, entry: unknown) => auditRecords.push(entry)) } as unknown as AuditLogService,
    )
    const actor: StaffAccess = {
      actorId: "staff-admin",
      forcePasswordChange: false,
      kind: "administrator",
      permissionKeys: new Set(["staff_accounts.manage"]),
      scopes: [{ kind: "all", id: null }],
    }

    await service.createAccount(actor, {
      username: "created",
      displayName: "Created",
      temporaryPassword: "Admin1234567",
      permissionKeys: ["workbench.read"],
      scopes: [{ kind: "organization", id: "org-1" }],
      expiresAt: null,
    })
    await service.resetPassword(actor, target.id, "Changed123456")
    await service.disableAccount(actor, target.id)

    expect(auditRecords).toEqual([
      expect.objectContaining({ actorId: "staff-admin", action: "staff.account.created" }),
      expect.objectContaining({ actorId: "staff-admin", targetId: "staff-target", action: "staff.account.password_reset" }),
      expect.objectContaining({ actorId: "staff-admin", targetId: "staff-target", action: "staff.account.disabled" }),
    ])
  })

  it("falls back to the first organization when an audited account has no scopes", async () => {
    const account = new StaffAccountEntity()
    account.id = "staff-no-scope"

    const auditRecords: unknown[] = []
    const dataSource = {
      manager: {
        find: vi.fn().mockResolvedValue([{ id: "org-default" }]),
      },
      getRepository: vi.fn((entity: unknown) => {
        if (entity === StaffAccountScopeEntity) {
          return { findBy: vi.fn().mockResolvedValue([]) }
        }
        throw new Error("unexpected repository")
      }),
    }

    await recordStaffAccountAudit(
      { getDataSource: vi.fn().mockResolvedValue(dataSource) } as unknown as ConfigurationDatabaseService,
      { record: vi.fn(async (_manager: unknown, entry: unknown) => auditRecords.push(entry)) } as unknown as AuditLogService,
      account,
      "staff.login.succeeded",
      account.id,
    )

    expect(dataSource.manager.find).toHaveBeenCalledWith(expect.any(Function), { order: { id: "ASC" }, take: 1 })
    expect(auditRecords).toEqual([
      expect.objectContaining({ organizationId: "org-default", actorId: "staff-no-scope", targetId: "staff-no-scope" }),
    ])
  })
})
