import type { Page } from "@playwright/test"

const apiBase = "http://127.0.0.1:3000"

export async function installStaffAuthMock(page: Page, permissionKeys: readonly string[] = [
  "workbench.read",
  "configuration.read",
  "roster.read",
  "roster.export",
  "orders.read",
  "refunds.preview",
  "refunds.simulate",
  "staff_accounts.manage",
]): Promise<void> {
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
}
