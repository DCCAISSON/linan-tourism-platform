import { assertIncludes, assertNoHorizontalOverflow, componentWithText, required, screenshot, waitForRoute } from "./e2e-ui.mjs"

export async function runDiscoveryBefore(program, fixture) {
  await program.reLaunch("/pages/index/index")
  let page = await program.currentPage()
  await page.waitFor(".brand-title")
  assertIncludes(await (await componentWithText(page, "正在加载")).text(), "正在加载", "initial loading state")
  await screenshot(program, "01-home-loading.png")
  fixture.catalogBlocked = false
  await page.waitFor(500)
  assertIncludes(await (await componentWithText(page, "¥128.00")).text(), "¥128.00", "school price on home")
  await assertNoHorizontalOverflow(program, page)
  await withDiscoveryTimeout("discovery-home-main-screenshot", screenshot(program, "02-home.png"), 10_000)

  fixture.emptyCatalog = true
  await program.reLaunch("/pages/index/index")
  page = await waitForRoute(program, "pages/index/index")
  await page.waitFor(300)
  assertIncludes(await (await componentWithText(page, "暂无已发布活动")).text(), "暂无已发布活动", "empty home")
  await screenshot(program, "03-home-empty.png")
  fixture.emptyCatalog = false
  fixture.failCatalog = true
  await program.reLaunch("/pages/index/index")
  page = await waitForRoute(program, "pages/index/index")
  await page.waitFor(300)
  assertIncludes(await (await componentWithText(page, "加载失败")).text(), "加载失败", "home failure")
  await screenshot(program, "04-home-error.png")
  fixture.failCatalog = false
  await (await required(await componentWithText(page, "加载失败"), ".retry-button")).tap()
  await page.waitFor(300)
  await (await required(page, ".home-activities-entry")).tap()
  page = await waitForRoute(program, "pages/activities/index")
  await page.waitFor(300)
  if (page.path !== "pages/activities/index") throw new Error("Home activity button did not switch tab")
  await screenshot(program, "05-activities.png")
  await (await required(await componentWithText(page, "¥128.00"), ".activity-detail-button")).tap()
  page = await waitForRoute(program, "pages/activities/detail", 10_000)
  await page.waitFor(300)
  assertIncludes(await (await required(page, ".introduction")).text(), "团队探索课程", "data driven introduction")
  assertIncludes(await (await required(page, ".activity-detail-page")).text(), "人数上限：40", "capacity upper bound")
  await screenshot(program, "06-activity-detail.png")
  const detailText = await (await required(page, ".activity-detail-page")).text()
  assertIncludes(detailText, "大明山地质研学", "active notice destination")
  assertIncludes(detailText, "1. 集合签到与安全提醒", "notice itinerary first item")
  assertIncludes(detailText, "7. 返程交接", "notice itinerary seventh item")
  assertIncludes(detailText, "学生195元/人", "notice student unit price")
  assertIncludes(detailText, "成人195元/人", "notice adult unit price")
  assertIncludes(detailText, "1名学生+1名成人390元", "notice package price")
  await program.pageScrollTo(800)
  await assertNoHorizontalOverflow(program, page)
  await screenshot(program, "06-activity-detail-notice.png")
  await program.pageScrollTo(0)
  await (await required(page, ".enrollment-entry")).tap()
  page = await waitForRoute(program, "pages/enrollment/index")
  await page.waitFor(350)
  const consent = await componentWithText(page, "登录后继续办理")
  if (fixture.requests.some(entry => entry.path === "/wechat/miniapp/login")) throw new Error("Login occurred before consent")
  await screenshot(program, "07-signup-consent.png")
  await (await required(consent, ".consent-choice")).tap()
  await (await required(consent, ".consent-login")).tap()
  await page.waitFor(500)
  const form = await required(page, "[u-i]")
  assertIncludes(await form.text(), "临安实验小学", "school passed into signup")
  assertIncludes(await form.text(), "2026-11-open", "trip passed into signup")
  await screenshot(program, "07-signup-from-detail.png")
  await program.switchTab("/pages/orders/index")
  page = await program.currentPage()
  await page.waitFor(300)
  assertIncludes(await (await componentWithText(page, "本家庭暂无订单")).text(), "本家庭暂无订单", "empty own orders")
  await screenshot(program, "08-orders-empty.png")
  await program.switchTab("/pages/family/index")
  page = await program.currentPage()
  await page.waitFor(300)
  assertIncludes(await (await componentWithText(page, "暂无常用参加人")).text(), "暂无常用参加人", "empty own family")
  await screenshot(program, "09-family-empty.png")
}

export async function runDiscoveryAfter(program) {
  let page = await waitForRoute(program, "pages/enrollment/index")
  const orderPanel = await componentWithText(page, "\u67e5\u770b\u6211\u7684\u8ba2\u5355")
  const orderPanelText = await orderPanel.text()
  assertNoForbiddenSurfaceText(orderPanelText, "post-payment order panel")
  assertIncludes(orderPanelText, "\u67e5\u770b\u6211\u7684\u8ba2\u5355", "formal own orders entry")
  await (await required(orderPanel, ".own-orders-entry")).tap()
  page = await waitForRoute(program, "pages/orders/index")
  await page.waitFor(300)
  assertIncludes(await (await required(page, ".order-history-card")).text(), "已付 ¥256.00", "paid own order list")
  await screenshot(program, "19-own-orders.png")
  await (await required(page, ".order-detail-entry")).tap()
  page = await waitForRoute(program, "pages/orders/detail")
  await page.waitFor(300)
  const people = await page.$$(".participant-snapshot")
  if (people.length !== 2) throw new Error(`Expected two historical participants, received ${people.length}`)
  assertIncludes(await people[0].text(), "张同学", "historical first participant")
  assertIncludes(await people[1].text(), "成人 · 无需年级班级", "historical adult placement")
  await screenshot(program, "20-order-detail.png")
  await program.pageScrollTo(10_000)
  await screenshot(program, "21-order-participants.png")
  await program.switchTab("/pages/family/index")
  page = await program.currentPage()
  await page.waitFor(300)
  const members = await page.$$(".family-member-card")
  if (members.length !== 2) throw new Error(`Expected two saved members, received ${members.length}`)
  await assertNoHorizontalOverflow(program, page)
  await screenshot(program, "22-family-center.png")
  await (await required(page, ".family-orders-entry")).tap()
  page = await waitForRoute(program, "pages/orders/index")
  if (page.path !== "pages/orders/index") throw new Error("Family orders entry did not switch tab")
}



function assertNoForbiddenSurfaceText(text, label) {
  const forbiddenTerms = [
    "\u672c\u5730\u6a21\u62df",
    "\u4f53\u9a8c\u7248",
    "\u6d4b\u8bd5\u7248",
    "\u5f00\u53d1\u7248",
    "\u6f14\u793a",
    "\u6a21\u62df",
  ]
  for (const forbidden of forbiddenTerms) {
    if (text.includes(forbidden)) throw new Error(`${label}: forbidden text is visible: ${forbidden}`)
  }
}

function withDiscoveryTimeout(stage, promise, timeoutMs) {
  let timer
  return Promise.race([
    promise.finally(() => { clearTimeout(timer) }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`E2E discovery stage timed out after ${timeoutMs}ms: ${stage}`)), timeoutMs)
    }),
  ])
}
