import type { Page } from "@playwright/test"

const apiBase = "http://127.0.0.1:3000"

type PlatformCapabilities = {
  readonly wechatPaymentEnabled: boolean
  readonly wechatRefundEnabled: boolean
  readonly paymentReconciliationEnabled: boolean
}

export async function installStaffAuthMock(page: Page, permissionKeys: readonly string[] = [
  "workbench.read",
  "configuration.read",
  "roster.read",
  "roster.import",
  "roster.export",
  "orders.read",
  "refunds.preview",
  "refunds.simulate",
  "transport.read",
  "transport.write",
  "transport.export",
  "sensitive_data.read",
  "staff_accounts.manage",
], capabilities: PlatformCapabilities = {
  wechatPaymentEnabled: true,
  wechatRefundEnabled: true,
  paymentReconciliationEnabled: true,
}): Promise<void> {
  await page.route(apiBase + "/staff/auth/me", async route => {
    await route.fulfill({
      json: {
        actorId: "staff-e2e",
        kind: "administrator",
        forcePasswordChange: false,
        permissionKeys,
        scopes: [{ kind: "all", id: null }],
      },
    })
  })
  await page.route(apiBase + "/capabilities", async route => {
    await route.fulfill({ json: capabilities })
  })
}
