import { expect, test } from "@playwright/test"

test("shows denied workbench data as an error and permits retry", async ({ page }) => {
  await page.route("http://127.0.0.1:3000/roster/workbench", route => route.fulfill({ status: 403, json: { message: "无权查看工作台" } }))
  await page.goto("/home")
  await expect(page.getByRole("alert")).toContainText("无权查看工作台")
  await expect(page.getByTestId("workbench-paid-headcount")).toHaveCount(0)
  await page.unroute("http://127.0.0.1:3000/roster/workbench")
  await page.route("http://127.0.0.1:3000/roster/workbench", route => route.fulfill({ json: {
    generatedAt: "2026-09-17T00:00:00.000Z", upcomingFrom: "2026-09-17T00:00:00.000Z", upcomingUntil: "2026-10-17T00:00:00.000Z",
    activeActivityCount: 0, upcomingSessionCount: 0, paidHeadcount: 0, paidAmountFen: 0, upcomingSessions: [],
  } }))
  await page.getByRole("button", { name: "刷新数据" }).click()
  await expect(page.getByTestId("workbench-paid-headcount")).toHaveText("0 人")
  await expect(page.getByRole("alert")).toHaveCount(0)
})
