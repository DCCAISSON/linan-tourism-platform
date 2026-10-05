import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"
const session = { id: "session-tomorrow", code: "研学团期", schoolName: "临安第一小学", activityTitle: "天目山自然观察与水源生态研学", startsAt: "2026-10-04T16:00:00.000Z", endsAt: "2026-10-05T08:00:00.000Z", priceFen: 20000, capacity: 40 }
const summary = { generatedAt: "2026-10-04T15:59:59.000Z", upcomingFrom: "2026-10-04T15:59:59.000Z", upcomingUntil: "2026-11-03T15:59:59.000Z", activeActivityCount: 1, upcomingSessionCount: 1, paidHeadcount: 2, paidAmountFen: 40000, upcomingSessions: [session] }

test.use({ timezoneId: "America/Los_Angeles" })

for (const boundary of [
  { name: "Beijing before midnight", generatedAt: "2026-10-04T15:59:59.000Z", startsAt: "2026-10-04T16:00:00.000Z", date: "2026年10月5日" },
  { name: "Beijing after midnight", generatedAt: "2026-10-04T16:00:00.000Z", startsAt: "2026-10-05T16:00:00.000Z", date: "2026年10月6日" },
  { name: "month end", generatedAt: "2026-01-31T15:59:59.000Z", startsAt: "2026-01-31T16:00:00.000Z", date: "2026年2月1日" },
  { name: "year end", generatedAt: "2026-12-31T15:59:59.000Z", startsAt: "2026-12-31T16:00:00.000Z", date: "2027年1月1日" },
]) {
  test(`shows the next Beijing calendar day at ${boundary.name}`, async ({ page }) => {
    // Given
    await installStaffAuthMock(page, ["workbench.read", "roster.read"])
    const sessions = [
      { ...session, startsAt: boundary.startsAt },
      { ...session, id: "today", activityTitle: "当日出发活动", startsAt: boundary.generatedAt },
      { ...session, id: "later", activityTitle: "以后出发活动", startsAt: "2027-02-01T00:00:00.000Z" },
    ]
    await page.route(`${apiBase}/roster/workbench`, route => route.fulfill({ json: { ...summary, generatedAt: boundary.generatedAt, upcomingSessionCount: 3, upcomingSessions: sessions } }))
    // When
    await page.goto("/home")
    // Then
    const tomorrow = page.getByRole("region", { name: "明日出发" })
    await expect(tomorrow).toContainText(`${boundary.date}（北京时间）`)
    await expect(tomorrow).toContainText("1 个团期")
    await expect(tomorrow).toContainText(session.schoolName)
    await expect(tomorrow).toContainText(session.activityTitle)
    await expect(tomorrow).not.toContainText("当日出发活动")
    await expect(tomorrow).not.toContainText("以后出发活动")
    await expect(tomorrow.getByRole("link", { name: "进入团期工作区" })).toHaveAttribute("href", "/roster?tourSessionId=session-tomorrow")
  })
}

test("opens the selected departure in the workspace without cross-session requests", async ({ page }, testInfo) => {
  // Given
  await installStaffAuthMock(page, ["workbench.read", "roster.read"])
  const businessRequests: string[] = []
  const writes: string[] = []
  page.on("request", request => {
    if (/\/(pretrip|insurance|staff\/notifications)\//.test(request.url())) businessRequests.push(request.url())
    if (request.url().startsWith(apiBase) && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url())
  })
  await page.route(`${apiBase}/roster/workbench`, route => route.fulfill({ json: summary }))
  await page.route(`${apiBase}/tour-sessions`, route => route.fulfill({ json: [{ ...session, organizationId: "school-1", catalogItemId: "catalog-1", status: "published" }] }))
  await page.route(`${apiBase}/schools`, route => route.fulfill({ json: [{ id: "school-1", code: "school", name: session.schoolName }] }))
  await page.route(`${apiBase}/catalog-items`, route => route.fulfill({ json: [{ id: "catalog-1", title: session.activityTitle }] }))
  await page.route(`${apiBase}/schools/*/grades`, route => route.fulfill({ json: [] }))
  await page.goto("/home")
  const tomorrow = page.getByRole("region", { name: "明日出发" })
  await expect(tomorrow.getByRole("link")).toBeVisible()
  for (const width of [375, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`workbench-departure-${width}.png`), fullPage: true })
  }
  expect(businessRequests).toEqual([])
  // When
  await tomorrow.getByRole("link", { name: "进入团期工作区" }).click()
  // Then
  await expect(page).toHaveURL(/\/roster\?tourSessionId=session-tomorrow/)
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue(session.id)
  expect(writes).toEqual([])
})

test("keeps departure links and shortcuts within the current route permissions", async ({ page }) => {
  // Given
  await installStaffAuthMock(page, ["workbench.read"])
  await page.route(`${apiBase}/roster/workbench`, route => route.fulfill({ json: summary }))
  // When
  await page.goto("/home")
  // Then
  const home = page.getByRole("region", { name: "工作台", exact: true })
  await expect(page.getByRole("region", { name: "明日出发" })).toContainText(session.activityTitle)
  await expect(home.getByRole("link")).toHaveCount(0)
})
