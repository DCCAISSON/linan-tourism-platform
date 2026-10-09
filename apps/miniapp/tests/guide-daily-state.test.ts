import { describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import type { GuideSession } from "../src/guide-execution-api"
import type { GuideDailyApi, PersonDailyReport, PersonDailyRevision } from "../src/guide-daily-api"
import { useGuideDaily } from "../src/guide-daily-state"

const person = { personRef: "paid:p1", displayName: "张同学", className: "一班", active: true, inactiveReason: null, vehicleId: "v1", healthAuthorized: true } as const
const session: GuideSession = { id: "s1", code: "QYX-01", startsAt: "2026-10-08T18:00:00Z", endsAt: "2026-10-10T18:00:00Z", vehicleIds: ["v1"], confirmationStatus: "current", vehicles: [], people: [person], groupPeople: [], events: [] }
const report: PersonDailyReport = { id: "daily1", tourSessionId: "s1", personRef: "paid:p1", reportDate: "2026-10-09", version: 2, lodgingCheck: "", mealStatus: "", breakfast: null, lunch: "recorded", dinner: "not_applicable", breakfastNote: "", lunchNote: "按时用餐", dinnerNote: "返程不含晚餐", bodyStatus: "身体情况", note: "私人备注", healthReadable: true, publicSummary: "当天活动顺利完成", publicApproved: true, updatedAt: "2026-10-09T08:00:00Z" }
const permissions = ["execution.read", "execution.write", "health.read"]
function setup(options: { api?: Partial<GuideDailyApi>; session?: GuideSession; permissions?: readonly string[] } = {}) {
  const api: GuideDailyApi = { list: async () => [report], save: vi.fn(async () => {}), approve: vi.fn(async () => {}), history: async () => [], ...options.api }
  let token: string | undefined = "token-a"
  let activeSession = options.session ?? session
  const login = vi.fn()
  const page = useGuideDaily({ api, getSession: async () => activeSession, me: async () => ({ actorId: "g1", forcePasswordChange: false, permissionKeys: options.permissions ?? permissions }), token: () => token, login })
  return { ...page, api, login, setToken(value: string | undefined) { token = value }, setSession(value: GuideSession) { activeSession = value } }
}
async function selected(options: Parameters<typeof setup>[0] = {}) {
  const page = setup(options)
  await page.load("s1")
  page.select("paid:p1", "2026-10-09")
  return page
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("未初始化") }
  let reject: (error: unknown) => void = () => { throw new Error("未初始化") }
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe("guide participant daily state", () => {
  it("retains private values and the version when correcting meals", async () => {
    const page = await selected()
    page.state.form.correctionReason = "补记早餐"
    page.state.form.breakfast = "recorded"
    await page.save()
    expect(page.api.save).toHaveBeenCalledWith("s1", "paid:p1", expect.objectContaining({ bodyStatus: report.bodyStatus, note: report.note, expectedVersion: 2, correctionReason: "补记早餐", breakfast: "recorded" }))
    expect(page.state.notice).toContain("待审批")
  })
  it("requires a correction reason for an existing daily report", async () => {
    const page = await selected()
    await page.save()
    expect(page.api.save).not.toHaveBeenCalled()
    expect(page.state.error).toContain("更正原因")
  })
  it("uses China dates and version zero for a new daily report", async () => {
    const page = await selected()
    page.select("paid:p1", "2026-10-11")
    await page.save()
    expect(page.api.save).toHaveBeenCalledWith("s1", "paid:p1", expect.objectContaining({ reportDate: "2026-10-11", expectedVersion: 0 }))
    expect(page.startsOn.value).toBe("2026-10-09")
  })
  it.each(["2026-10-08", "2026-10-12", "2026-02-30"])("rejects an invalid or out-of-session date %s", async date => {
    const page = await selected()
    page.select("paid:p1", date)
    await page.save()
    expect(page.api.save).not.toHaveBeenCalled()
  })
  it.each([
    { session: { ...session, confirmationStatus: "stale" } as const },
    { session: { ...session, people: [{ ...person, vehicleId: "v2" }] } },
    { session: { ...session, people: [{ ...person, active: false }] } },
    { permissions: ["execution.read"] },
  ])("blocks writing outside active assigned permissions %j", async options => {
    const page = await selected(options)
    page.state.form.correctionReason = "补记"
    await page.save()
    expect(page.api.save).not.toHaveBeenCalled()
  })
  it.each([
    { permissions: ["execution.read", "execution.write"] },
    { session: { ...session, people: [{ ...person, healthAuthorized: false }] } },
    { api: { list: async () => [{ ...report, healthReadable: false }] } },
  ])("clears unreadable health values and sends empty private fields %j", async options => {
    const page = await selected(options)
    page.state.form.correctionReason = "更正午餐"
    await page.save()
    expect(page.state.reports[0]).toMatchObject({ bodyStatus: "", note: "", healthReadable: false })
    expect(page.api.save).toHaveBeenCalledWith("s1", "paid:p1", expect.objectContaining({ bodyStatus: "", note: "" }))
  })
  it("filters reports from other people and sessions", async () => {
    const page = setup({ api: { list: async () => [report, { ...report, id: "foreign", personRef: "paid:other" }, { ...report, id: "foreign-session", tourSessionId: "s2" }] } })
    await page.load("s1")
    expect(page.state.reports.map(row => row.id)).toEqual(["daily1"])
  })
  it("removes all private drafts as soon as refresh starts after authorization revocation", async () => {
    const page = await selected()
    page.setSession({ ...session, people: [{ ...person, healthAuthorized: false }] })
    const loading = page.load("s1")
    expect(page.state.form.bodyStatus).toBe("")
    await loading
    expect(page.state.form.bodyStatus).toBe("")
    expect(page.healthReadable.value).toBe(false)
  })
  it("blocks approval without publish permission", async () => {
    const page = await selected()
    page.state.summary = "当天活动顺利完成"
    await page.approve()
    expect(page.api.approve).not.toHaveBeenCalled()
  })
  it("refreshes health content after an authorized approval", async () => {
    const page = await selected({ permissions: [...permissions, "execution.publish"] })
    page.state.summary = "当天活动顺利完成"
    await page.approve()
    expect(page.api.approve).toHaveBeenCalledWith("s1", expect.objectContaining({ id: "daily1", version: 2 }), "当天活动顺利完成")
    expect(page.state.form.bodyStatus).toBe(report.bodyStatus)
  })
  it("permits an approval account to approve without granting report write access", async () => {
    const page = await selected({ permissions: ["execution.read", "execution.publish"] })
    page.state.summary = "课程顺利完成"
    await page.approve()
    expect(page.canWrite.value).toBe(false)
    expect(page.api.approve).toHaveBeenCalledWith("s1", expect.objectContaining({ id: "daily1", version: 2 }), "课程顺利完成")
    expect(page.api.save).not.toHaveBeenCalled()
  })
  it("refreshes after version conflict and drops the rejected draft", async () => {
    const page = await selected({ api: { save: async () => { throw new ApiError(409, "日报已更新") } } })
    page.state.form.correctionReason = "修正"
    page.state.form.lunchNote = "被拒绝的草稿"
    await page.save()
    expect(page.state.form.lunchNote).toBe(report.lunchNote)
    expect(page.state.form.correctionReason).toBe("")
    expect(page.state.error).toContain("刷新")
    expect(page.state.notice).toBe("")
  })
  it("ignores late history after hide and clears all drafts", async () => {
    const response = deferred<readonly PersonDailyRevision[]>()
    const page = await selected({ api: { history: () => response.promise } })
    const loading = page.loadHistory()
    page.clear()
    response.resolve([{ ...report, reportId: report.id, recordedByName: "导游", createdAt: report.updatedAt, correctionReason: "修正" }])
    await loading
    expect(page.state.session).toBeNull()
    expect(page.state.history).toEqual([])
    expect(page.state.form.bodyStatus).toBe("")
    expect(page.state.personRef).toBe("")
  })
  it("does not accept a response from an earlier account", async () => {
    const response = deferred<readonly PersonDailyReport[]>()
    const page = setup({ api: { list: () => response.promise } })
    const loading = page.load("s1")
    await Promise.resolve()
    page.setToken("token-b")
    response.resolve([report])
    await loading
    expect(page.state.session).toBeNull()
    expect(page.state.reports).toEqual([])
  })
  it("clears records and returns to login when the current account expires", async () => {
    const page = await selected({ api: { save: async () => { page.setToken(undefined); throw new ApiError(401, "登录失效") } } })
    page.state.form.correctionReason = "修正"
    await page.save()
    expect(page.state.session).toBeNull()
    expect(page.state.form.bodyStatus).toBe("")
    expect(page.login).toHaveBeenCalledOnce()
  })
  it("clears private drafts when write access is revoked during save", async () => {
    const page = await selected({ api: { save: async () => { throw new ApiError(403, "分配已撤销") } } })
    page.state.form.correctionReason = "补记"
    await page.save()
    expect(page.state.reports).toEqual([])
    expect(page.state.form.bodyStatus).toBe("")
    expect(page.state.error).toContain("无权")
  })
  it("retains a failed network draft without reporting success", async () => {
    const page = await selected({ api: { save: async () => { throw new ApiError(0, "网络连接失败") } } })
    page.state.form.correctionReason = "补记"
    page.state.form.lunchNote = "已补充"
    await page.save()
    expect(page.state.form.lunchNote).toBe("已补充")
    expect(page.state.notice).toBe("")
    expect(page.state.error).toBe("网络连接失败")
  })
  it("rejects a form carrying an old expected version", async () => {
    const page = await selected()
    page.state.form.expectedVersion = 1
    page.state.form.correctionReason = "补记"
    await page.save()
    expect(page.api.save).not.toHaveBeenCalled()
    expect(page.state.error).toContain("刷新")
  })
  it("does not show a previous save result after switching sessions", async () => {
    const response = deferred<void>()
    const page = await selected({ api: { save: () => response.promise } })
    page.state.form.correctionReason = "补记"
    const saving = page.save()
    page.setSession({ ...session, id: "s2" })
    await page.load("s2")
    response.resolve()
    await saving
    expect(page.state.session?.id).toBe("s2")
    expect(page.state.notice).toBe("")
    expect(page.state.reports).toEqual([])
  })
  it("does not attach delayed history to a newly selected date", async () => {
    const response = deferred<readonly PersonDailyRevision[]>()
    const page = await selected({ api: { history: () => response.promise } })
    const loading = page.loadHistory()
    page.select("paid:p1", "2026-10-10")
    response.resolve([{ ...report, reportId: report.id, recordedByName: "导游", createdAt: report.updatedAt, correctionReason: "修正" }])
    await loading
    expect(page.state.historyLoaded).toBe(false)
    expect(page.state.history).toEqual([])
  })
  it("prevents an expired displayed account from posting a saved draft", async () => {
    const page = await selected()
    page.state.form.correctionReason = "补记"
    page.setToken(undefined)
    await page.save()
    expect(page.api.save).not.toHaveBeenCalled()
    expect(page.state.form.bodyStatus).toBe("")
    expect(page.login).toHaveBeenCalledOnce()
  })
})
