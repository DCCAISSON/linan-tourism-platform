import { describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import type { GuideSession } from "../src/guide-execution-api"
import type { EvaluationDashboard, EvaluationRow, GuideEvaluationsApi } from "../src/guide-evaluations-api"
import { useGuideEvaluations } from "../src/guide-evaluations-state"

const student = { personRef: "paid:p1", displayName: "张同学", gradeName: "三年级", className: "一班" } as const
const standard = { id: "std1", tourSessionId: "s1", title: "研学评价", version: 1, confirmedAt: "2026-10-09T01:00:00Z", items: [{ code: "A", label: "优秀", description: "表现优秀" }, { code: "B", label: "合格", description: "达到要求" }], dimensions: [{ code: "team", label: "协作", description: "记录事实" }] } as const
const row: EvaluationRow = { ...student, id: "eval1", version: 1, organizationId: "org1", standardId: "std1", gradeCode: "A", gradeLabel: "优秀", internalComment: "主动协助同学", excellent: true, attention: false, confirmedAt: null, dimensionObservations: [{ code: "team", observation: "帮助同学整理物品" }] }
const dashboard: EvaluationDashboard = { organizationId: "org1", students: [student], standards: [standard], evaluations: [] }
const session: GuideSession = { id: "s1", code: "QYX-01", startsAt: "2026-10-09T00:00:00Z", endsAt: "2026-10-10T12:00:00Z", vehicleIds: ["v1"], confirmationStatus: "current", vehicles: [], people: [{ ...student, active: true, inactiveReason: null, vehicleId: "v1", healthAuthorized: false }], groupPeople: [], events: [] }
const permissions = ["execution.read", "evaluations.read", "evaluations.write", "evaluations.confirm"]

function setup(overrides: Partial<GuideEvaluationsApi> = {}, keys: readonly string[] = permissions) {
  const api: GuideEvaluationsApi = { getDashboard: vi.fn(async () => dashboard), create: vi.fn(async () => row), revise: vi.fn(async () => row), confirm: vi.fn(async () => [{ ...row, confirmedAt: "2026-10-09T02:00:00Z" }]), ...overrides }
  let token: string | undefined = "token-a"
  const me = vi.fn(async () => ({ actorId: "guide", forcePasswordChange: false, permissionKeys: keys }))
  const getSession = vi.fn(async (id: string) => ({ ...session, id }))
  const login = vi.fn()
  const page = useGuideEvaluations({ api, getSession, me, token: () => token, login })
  return { ...page, api, me, getSession, login, setToken(value: string | undefined) { token = value } }
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("未初始化") }
  let reject: (error: unknown) => void = () => { throw new Error("未初始化") }
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe("guide student evaluations", () => {
  it("saves only the selected student's manual grade and observations", async () => {
    const page = setup()
    await page.load("s1")
    page.edit("paid:p1")
    page.selectStandard("std1")
    if (!page.state.form) throw new Error("评价表单未打开")
    Object.assign(page.state.form, { gradeCode: "A", internalComment: "主动协助同学", excellent: true })
    await page.save()
    expect(page.api.create).toHaveBeenCalledWith(expect.objectContaining({ tourSessionId: "s1", standardId: "std1", observations: [expect.objectContaining({ personRef: "paid:p1", gradeCode: "A", excellent: true, attention: false })] }))
    expect(page.state.dashboard?.evaluations[0]?.gradeCode).toBe("A")
    expect(page.state.notice).toBe("评价已保存，待授权人员确认。")
    expect(page.state.form).toBeNull()
  })
  it("uses the current revision and retains existing dimension observations", async () => {
    const page = setup({ getDashboard: async () => ({ ...dashboard, evaluations: [row] }) })
    await page.load("s1")
    page.edit("paid:p1")
    await page.save()
    expect(page.api.create).not.toHaveBeenCalled()
    expect(page.api.revise).toHaveBeenCalledWith(row, expect.objectContaining({ dimensionObservations: row.dimensionObservations }))
  })
  it("confirms all students only after explicit confirmation", async () => {
    const page = setup({ getDashboard: async () => ({ ...dashboard, evaluations: [row] }) })
    await page.load("s1")
    await page.confirm(true)
    expect(page.api.confirm).toHaveBeenCalledWith("s1")
    expect(page.state.dashboard?.evaluations[0]?.confirmedAt).not.toBeNull()
    expect(page.state.notice).toBe("全团学生评价已确认。")
  })
  it("does not confirm when the confirmation dialog is cancelled", async () => {
    const page = setup({ getDashboard: async () => ({ ...dashboard, evaluations: [row] }) })
    await page.load("s1")
    await page.confirm(false)
    expect(page.api.confirm).not.toHaveBeenCalled()
  })
  it("keeps read-only accounts from opening a form or writing", async () => {
    const page = setup({}, ["execution.read", "evaluations.read"])
    await page.load("s1")
    page.edit("paid:p1")
    await page.save()
    await page.confirm(true)
    expect(page.state.form).toBeNull()
    expect(page.api.create).not.toHaveBeenCalled()
    expect(page.api.confirm).not.toHaveBeenCalled()
  })
  it("requires confirm permission independently of write permission", async () => {
    const page = setup({ getDashboard: async () => ({ ...dashboard, evaluations: [row] }) }, ["execution.read", "evaluations.read", "evaluations.write"])
    await page.load("s1")
    await page.confirm(true)
    expect(page.api.confirm).not.toHaveBeenCalled()
    expect(page.state.canWrite).toBe(true)
  })
  it("shows only assigned active students while keeping full-group confirmation counts", async () => {
    const foreign = { ...student, personRef: "paid:foreign", displayName: "其他车辆学生" } as const
    const page = setup({ getDashboard: async () => ({ ...dashboard, students: [student, foreign], evaluations: [row] }) })
    await page.load("s1")
    page.edit(foreign.personRef)
    await page.confirm(true)
    expect(page.state.dashboard?.students).toEqual([student])
    expect(page.state.group).toEqual({ total: 2, ungraded: 1, pending: 1 })
    expect(page.state.form).toBeNull()
    expect(page.api.confirm).not.toHaveBeenCalled()
  })
  it("keeps a manual grade empty until chosen and allows observation-only saving", async () => {
    const page = setup({ create: vi.fn(async () => ({ ...row, gradeCode: null, gradeLabel: null, standardId: null })) })
    await page.load("s1")
    page.edit("paid:p1")
    await page.save()
    expect(page.api.create).toHaveBeenCalledWith(expect.objectContaining({ standardId: null, observations: [expect.objectContaining({ gradeCode: null })] }))
  })
  it("retains the form on a failed save without reporting success", async () => {
    const page = setup({ create: async () => { throw new ApiError(0, "网络错误") } })
    await page.load("s1")
    page.edit("paid:p1")
    if (!page.state.form) throw new Error("评价表单未打开")
    page.state.form.internalComment = "待保存观察"
    await page.save()
    expect(page.state.form?.internalComment).toBe("待保存观察")
    expect(page.state.notice).toBe("")
    expect(page.state.error).toContain("网络错误")
    expect(page.state.saving).toBe(false)
  })
  it.each([401, 403, 409])("clears student data and drafts on status %s", async status => {
    const page = setup({ create: async () => { if (status === 401) page.setToken(undefined); throw new ApiError(status, "权限或记录变化") } })
    await page.load("s1")
    page.edit("paid:p1")
    await page.save()
    expect(page.state.dashboard).toBeNull()
    expect(page.state.form).toBeNull()
    expect(page.state.canWrite).toBe(false)
    expect(page.login).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  })
  it("ignores a late dashboard after hide", async () => {
    const response = deferred<EvaluationDashboard>()
    const page = setup({ getDashboard: () => response.promise })
    const loading = page.load("s1")
    await Promise.resolve()
    page.clear()
    response.resolve(dashboard)
    await loading
    expect(page.state.dashboard).toBeNull()
    expect(page.state.form).toBeNull()
  })
  it("ignores an old-session save after a different session loads", async () => {
    const response = deferred<EvaluationRow>()
    const page = setup({ create: () => response.promise })
    await page.load("s1")
    page.edit("paid:p1")
    const saving = page.save()
    await page.load("s2")
    response.resolve(row)
    await saving
    expect(page.state.session?.id).toBe("s2")
    expect(page.state.notice).toBe("")
    expect(page.state.dashboard?.evaluations).toEqual([])
  })
  it("does not submit old-account data after the token changes", async () => {
    const page = setup()
    await page.load("s1")
    page.edit("paid:p1")
    page.setToken("token-b")
    await page.save()
    expect(page.api.create).not.toHaveBeenCalled()
    expect(page.state.dashboard).toBeNull()
    expect(page.state.form).toBeNull()
  })
  it("does not let an old-account failure clear a new account", async () => {
    const response = deferred<EvaluationRow>()
    const page = setup({ create: () => response.promise })
    await page.load("s1")
    page.edit("paid:p1")
    const saving = page.save()
    page.setToken("token-b")
    await page.load("s2")
    response.reject(new ApiError(401, "旧账号失效"))
    await saving
    expect(page.state.session?.id).toBe("s2")
    expect(page.login).not.toHaveBeenCalled()
  })
  it("routes forced password change before requesting any student data", async () => {
    const page = setup()
    page.me.mockResolvedValue({ actorId: "guide", forcePasswordChange: true, permissionKeys: permissions })
    await page.load("s1")
    expect(page.login).toHaveBeenCalledOnce()
    expect(page.api.getDashboard).not.toHaveBeenCalled()
    expect(page.getSession).not.toHaveBeenCalled()
  })
})
