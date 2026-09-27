import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick, ref } from "vue"
import SessionEnrollmentScope from "../src/views/configuration/SessionEnrollmentScope.vue"
import type { EnrollmentScope } from "../src/api/configuration"
const api = vi.hoisted(() => ({ listGrades: vi.fn(), listClasses: vi.fn() }))
vi.mock("../src/api/configuration", () => ({ ...api, readableApiError: (error: unknown) => error instanceof Error ? error.message : "加载失败" }))
const apps: ReturnType<typeof createApp>[] = []
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.resetAllMocks() })
async function flush() { for (let i = 0; i < 8; i++) await nextTick() }
function mount() {
  const model = ref<EnrollmentScope>(null)
  const school = ref("school")
  const valid = ref(true)
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(() => h(SessionEnrollmentScope, { inputId: "scope", schoolId: school.value, modelValue: model.value, "onUpdate:modelValue": (value: EnrollmentScope) => { model.value = value }, onValid: (value: boolean) => { valid.value = value } }))
  apps.push(app); app.mount(host)
  return { model, school, valid }
}
function select(id: string, values: readonly string[]) {
  const node = document.getElementById(id)
  if (!(node instanceof HTMLSelectElement)) throw new Error(`missing ${id}`)
  for (const option of node.options) option.selected = values.includes(option.value)
  node.dispatchEvent(new Event("change", { bubbles: true }))
}
describe("enrollment scope editor", () => {
  it("selects multiple grades and classes and rejects an empty restricted scope", async () => {
    api.listGrades.mockResolvedValue([{ id: "g1", name: "一年级", status: "active" }, { id: "g2", name: "二年级", status: "active" }])
    api.listClasses.mockImplementation(async (gradeId: string) => [{ id: `${gradeId}-c1`, gradeId, name: "一班", status: "active" }, { id: `${gradeId}-c2`, gradeId, name: "二班", status: "active" }])
    const state = mount(); await flush()
    select("scope-mode", ["selected"]); await flush()
    expect(state.valid.value).toBe(false)
    select("scope-grades", ["g1", "g2"]); await flush()
    select("scope-g1-mode", ["selected"]); await flush()
    expect(state.valid.value).toBe(false)
    select("scope-g1-classes", ["g1-c1", "g1-c2"]); await flush()
    expect(state.model.value).toEqual([{ gradeId: "g1", classIds: ["g1-c1", "g1-c2"] }, { gradeId: "g2", classIds: null }])
    expect(state.valid.value).toBe(true)
  })
  it("preserves selection after loading failure and allows retry", async () => {
    api.listGrades.mockRejectedValueOnce(new Error("年级读取失败")).mockResolvedValue([{ id: "g1", name: "一年级", status: "active" }])
    api.listClasses.mockResolvedValue([])
    const state = mount(); state.model.value = [{ gradeId: "g1", classIds: null }]; await flush()
    expect(document.body.textContent).toContain("年级读取失败")
    expect(state.valid.value).toBe(false)
    document.querySelector("button")?.click(); await flush()
    expect(state.model.value).toEqual([{ gradeId: "g1", classIds: null }])
    expect(state.valid.value).toBe(true)
  })
})
