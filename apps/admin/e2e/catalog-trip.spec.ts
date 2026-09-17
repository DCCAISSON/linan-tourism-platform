import { expect, test } from "@playwright/test"
const apiBase = "http://127.0.0.1:3000"
test("manages schools, classes, catalog items, and tour sessions", async ({ page }) => {
  let tourSession = {
    id: "session-2",
    organizationId: "school-1",
    catalogItemId: "catalog-1",
    code: "session-2",
    startsAt: "2026-11-12T00:00:00.000Z",
    endsAt: "2026-11-13T00:00:00.000Z",
    enrollmentOpensAt: "2026-10-01T00:00:00.000Z",
    enrollmentClosesAt: "2026-10-30T00:00:00.000Z",
    status: "draft",
    priceFen: 12800,
    capacity: 30,
    policyVersion: "2026-01",
  }
  await page.route(`${apiBase}/schools`, async route => {
    if (route.request().method() === "POST") {
      const payload = await route.request().postDataJSON()
      expect(payload).toEqual({
        name: "青山湖第一小学",
        code: "QSH001",
      })
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          id: "school-2",
          name: "青山湖第一小学",
          code: "QSH001",
          status: "active",
        }),
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "school-1",
          name: "临安实验小学",
          code: "LASY",
        },
      ]),
    })
  })
  await page.route(`${apiBase}/schools/school-1/grades`, async route => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        status: 409,
        body: JSON.stringify({ message: "年级已存在" }),
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "grade-1",
          organizationId: "school-1",
          code: "grade-1",
          name: "一年级",
        },
      ]),
    })
  })
  await page.route(`${apiBase}/grades/grade-1/classes`, async route => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          id: "class-2",
          gradeId: "grade-1",
          code: "class-2",
          name: "二班",
        }),
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  })
  await page.route(`${apiBase}/catalog-items`, async route => {
    if (route.request().method() === "POST") {
      const payload = await route.request().postDataJSON()
      expect(payload).toMatchObject({
        organizationId: "school-1",
        code: "catalog-2",
        title: "博物馆水系课程",
        status: "active",
        description: "沿水系观察地形与人文，完成研学记录。",
        coverImageUrl: "https://example.com/authorized-course.webp",
      })
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          id: "catalog-2",
          organizationId: "school-1",
          code: "catalog-2",
          title: "博物馆水系课程",
          status: "active",
          policyVersion: "2026-01",
        }),
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "catalog-1",
          organizationId: "school-1",
          code: "catalog-1",
          title: "天目山自然观察",
          status: "active",
          policyVersion: "2026-01",
        },
      ]),
    })
  })
  await page.route(`${apiBase}/tour-sessions`, async route => {
    if (route.request().method() === "POST") {
      const payload = await route.request().postDataJSON()
      expect(payload).toMatchObject({
        organizationId: "school-1",
        catalogItemId: "catalog-1",
        code: "session-2",
        priceFen: 12800,
        capacity: 30,
        enrollmentOpensAt: "2026-10-01T00:00:00.000Z",
        enrollmentClosesAt: "2026-10-30T00:00:00.000Z",
      })
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify(tourSession),
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      status: 500,
      body: JSON.stringify({ message: "团期服务暂不可用" }),
    })
  })
  await page.route(`${apiBase}/catalog-items/catalog-1`, async route => {
    await route.fulfill({
      contentType: "application/json",
      status: 409,
      body: JSON.stringify({ message: "课程已有团期，不能删除" }),
    })
  })
  await page.route(`${apiBase}/tour-sessions/session-2`, async route => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204 })
      return
    }
    const payload = await route.request().postDataJSON()
    tourSession = { ...tourSession, ...payload }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(tourSession),
    })
  })
  await page.goto("/configuration")
  await expect(page.getByRole("heading", { name: "学校、课程与团期配置" })).toBeVisible()
  await expect(page.getByRole("region", { name: "学校", exact: true }).getByText("临安实验小学")).toBeVisible()
  await expect(page.getByText("暂无班级，请先新增班级。")).toBeVisible()
  await expect(page.getByRole("region", { name: "课程", exact: true }).locator(".record-list strong").filter({ hasText: "天目山自然观察" })).toBeVisible()
  await expect(page.getByText("团期服务暂不可用")).toBeVisible()
  await page.getByRole("region", { name: "课程", exact: true }).getByRole("button", { name: "删除" }).click()
  await expect(page.getByText("课程已有团期，不能删除")).toBeVisible()
  await page.getByLabel("学校名称").fill("青山湖第一小学")
  await page.getByLabel("学校编码").fill("QSH001")
  await page.getByRole("button", { name: "新增学校" }).click()
  await expect(page.getByRole("region", { name: "学校", exact: true }).getByText("青山湖第一小学")).toBeVisible()
  await page.getByLabel("所属学校").selectOption("school-1")
  await page.getByLabel("年级编码").fill("grade-1")
  await page.getByLabel("年级名称").fill("一年级")
  await page.getByRole("button", { name: "新增年级" }).click()
  await expect(page.getByText("年级已存在")).toBeVisible()
  await page.getByLabel("团期价格（元）").fill("-1")
  await page.getByRole("button", { name: "新增团期" }).click()
  await expect(page.getByText("团期价格不能为负数")).toBeVisible()
  await page.getByLabel("课程学校").selectOption("school-1")
  await page.getByLabel("课程编码").fill("catalog-2")
  await page.getByLabel("课程名称").fill("博物馆水系课程")
  await page.getByLabel("课程介绍", { exact: true }).fill("沿水系观察地形与人文，完成研学记录。")
  await page.getByLabel("封面链接", { exact: true }).fill("https://example.com/authorized-course.webp")
  await page.getByRole("button", { name: "新增课程" }).click()
  await expect(page.getByRole("region", { name: "课程", exact: true }).locator(".record-list strong").filter({ hasText: "博物馆水系课程" })).toBeVisible()
  await page.getByLabel("所属年级").selectOption("grade-1")
  await page.getByLabel("班级编码").fill("class-2")
  await page.getByLabel("班级名称").fill("二班")
  await page.getByRole("button", { name: "新增班级" }).click()
  await expect(page.getByText("二班")).toBeVisible()
  await page.getByLabel("团期学校").selectOption("school-1")
  await page.getByLabel("团期课程").selectOption("catalog-1")
  await page.getByLabel("团期编码").fill("session-2")
  await page.getByLabel("团期价格（元）").fill("128")
  await page.getByLabel("容量").fill("30")
  await page.getByLabel("出发日期", { exact: true }).fill("2026-11-12")
  await page.getByLabel("结束日期", { exact: true }).fill("2026-11-13")
  await page.getByLabel("报名开始", { exact: true }).fill("2026-10-01")
  await page.getByLabel("报名截止", { exact: true }).fill("2026-10-30")
  await page.getByRole("button", { name: "新增团期" }).click()
  const sessionRow = page.locator(".record-list--columns li").filter({ hasText: "天目山自然观察" })
  await expect(sessionRow.getByText("¥128.00")).toBeVisible()
  await expect(sessionRow.getByText("2026-11-12 至 2026-11-13")).toBeVisible()
  await expect(sessionRow.getByText("2026-10-01 至 2026-10-30")).toBeVisible()
  await page.getByRole("region", { name: "团期" }).getByRole("button", { name: "发布" }).click()
  await expect(sessionRow.getByText("已发布")).toBeVisible()
  await page.getByRole("region", { name: "团期" }).getByRole("button", { name: "关闭" }).click()
  await expect(sessionRow.locator("span").filter({ hasText: /^关闭$/ })).toBeVisible()
  await page.getByLabel("编辑团期").selectOption("session-2")
  await page.getByLabel("修改价格（元）").fill("188")
  await page.getByLabel("修改出发日期").fill("2026-12-01")
  await page.getByLabel("修改结束日期").fill("2026-12-02")
  await page.getByLabel("修改报名开始").fill("2026-11-01")
  await page.getByLabel("修改报名截止").fill("2026-11-20")
  await page.getByRole("button", { name: "保存团期修改" }).click()
  await expect(sessionRow.getByText("¥188.00")).toBeVisible()
  await expect(sessionRow.getByText("2026-12-01 至 2026-12-02")).toBeVisible()
  await expect(sessionRow.getByText("2026-11-01 至 2026-11-20")).toBeVisible()
})
