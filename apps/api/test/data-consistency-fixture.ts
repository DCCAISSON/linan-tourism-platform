import { randomUUID } from "node:crypto"
import { StaffAccountEntity, StaffAccountPermissionEntity, StaffAccountScopeEntity, StaffSessionEntity } from "../src/domain/entities/index.js"
import { hashToken, STAFF_SESSION_COOKIE } from "../src/modules/iam/staff-session-token.js"
import type { StaffPermissionKey, StaffScope } from "../src/modules/iam/staff-permissions.js"
import { dataSource } from "./catalog-trip-fixture.js"
import { resetMockPaymentData } from "./mock-payment-fixture.js"

export async function createScopedStaff(input: {
  readonly scope: string
  readonly permissions: readonly StaffPermissionKey[]
  readonly staffScope: StaffScope
}): Promise<Record<string, string>> {
  const id = randomUUID()
  const token = randomUUID()
  await dataSource.getRepository(StaffAccountEntity).save(Object.assign(new StaffAccountEntity(), {
    id, username: `${input.scope}-${id.slice(0, 8)}`, displayName: "Synthetic Staff",
    passwordHash: "unused-synthetic-test-account", forcePasswordChange: false,
  }))
  await dataSource.getRepository(StaffAccountPermissionEntity).save(input.permissions.map(permissionKey =>
    Object.assign(new StaffAccountPermissionEntity(), { id: randomUUID(), staffAccountId: id, permissionKey })))
  await dataSource.getRepository(StaffAccountScopeEntity).save(Object.assign(new StaffAccountScopeEntity(), {
    id: randomUUID(), staffAccountId: id, scopeKind: input.staffScope.kind, scopeId: input.staffScope.id,
  }))
  await dataSource.getRepository(StaffSessionEntity).save(Object.assign(new StaffSessionEntity(), {
    id: randomUUID(), staffAccountId: id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 600000),
  }))
  return { Cookie: `${STAFF_SESSION_COOKIE}=${token}` }
}

export async function cleanupConsistencyData(scope: string): Promise<void> {
  await dataSource.query("delete rl from refund_request_lines rl join refund_requests r on r.id=rl.refund_request_id join orders o on o.id=r.order_id join enrollments e on e.id=o.enrollment_id join families f on f.id=e.family_id where f.code like ?", [`family-${scope}%`])
  await dataSource.query("delete r from refund_requests r join orders o on o.id=r.order_id join enrollments e on e.id=o.enrollment_id join families f on f.id=e.family_id where f.code like ?", [`family-${scope}%`])
  await resetMockPaymentData(scope)
  await dataSource.query("delete from staff_accounts where username like ?", [`${scope}%`])
}
