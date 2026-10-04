import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Page = {
  sections: readonly { id: string; title: string }[]
  openSection: (id: string) => void
  activeSectionId: { value: string | undefined }
  activeSection: { value: { id: string; title: string } | undefined }
  closeSection: () => void
  sessionChoices: { value: readonly { session: { id: string } }[] }
  selectSession: (id: string) => void
  completeEnrollmentLogin: () => void
  enroll: () => void
}
const scroll = vi.fn()
const navigate = vi.fn()
const registerShare = vi.fn<(callback: () => object) => void>()
const state = vue.ref("ready")
const selectedTrip = { activity: { id: "activity", title: "大明山地质探索", coverImageUrl: "" }, session: { id: "trip & 1", organizationId: "school & 1" }, canEnroll: true }
const trips = vue.ref([selectedTrip])
const sessionToken = vue.ref<string | undefined>("session")
const completedProfile = vue.ref(true)
const source = readFileSync(new URL("../src/pages/activities/detail.vue", import.meta.url), "utf8")
const { descriptor } = parse(source)

function setup(): Page {
  const compiled = compileScript(descriptor, { id: "activity-detail" })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(code, {
    exports,
    uni: { pageScrollTo: scroll, navigateTo: navigate },
    require: (module: string) => {
      if (module === "vue") return vue
      if (module === "@dcloudio/uni-app") return { onLoad: (callback: (query: { sessionId: string }) => void) => callback({ sessionId: selectedTrip.session.id }), onShareAppMessage: registerShare }
      if (module === "../../activity-catalog") return { activitySessionChoices: (items: readonly typeof selectedTrip[], id: string) => {
        const selected = items.find((item) => item.session.id === id)
        return selected === undefined ? [] : items.filter((item) => item.activity.id === selected.activity.id && item.session.organizationId === selected.session.organizationId)
      } }
      if (module === "../../wechat-token") return { getWechatSessionToken: () => sessionToken.value, getEnrollmentDraftOwner: () => "family:test" }
      if (module === "../../profile-display") return { hasCompletedLocalProfile: () => completedProfile.value }
      if (module === "./useActivityCatalog") return { useActivityCatalog: () => ({ state, error: vue.ref(""), trips, load: vi.fn() }) }
      return {}
    },
  })
  return (exports["default"] as { setup: (props: object, context: object) => Page }).setup({}, { expose: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.value = "ready"
  trips.value = [{ ...selectedTrip }]
  sessionToken.value = "session"
  completedProfile.value = true
})

describe("activity sharing", () => {
  it.each([true, false])("shares the selected session when enrollment availability is %s", (canEnroll) => {
    trips.value = [{ ...selectedTrip, canEnroll }]
    setup()
    expect(registerShare).toHaveBeenCalledOnce()
    expect(registerShare.mock.calls[0]?.[0]()).toEqual({ title: "大明山地质探索", path: "/pages/activities/detail?sessionId=trip%20%26%201" })
  })

  it("uses the current activity cover when one exists", () => {
    trips.value = [{ ...selectedTrip, activity: { ...selectedTrip.activity, coverImageUrl: "https://example.com/cover.jpg" } }]
    setup()
    expect(registerShare.mock.calls[0]?.[0]()).toEqual({ title: "大明山地质探索", path: "/pages/activities/detail?sessionId=trip%20%26%201", imageUrl: "https://example.com/cover.jpg" })
  })

  it.each(["loading", "error", "empty"])("shares the catalog instead of stale detail when state is %s", (nextState) => {
    state.value = nextState
    setup()
    expect(registerShare.mock.calls[0]?.[0]()).toEqual({ title: "研学活动", path: "/pages/activities/index" })
  })

  it("shares the catalog when the requested session does not exist", () => {
    trips.value = []
    setup()
    expect(registerShare.mock.calls[0]?.[0]()).toEqual({ title: "研学活动", path: "/pages/activities/index" })
  })
})

describe("activity detail section navigation", () => {
  it("opens only the selected section and closes without moving the page or starting enrollment", () => {
    const page = setup()
    expect(page.activeSection.value).toBeUndefined()
    expect(page.sections.map((section) => section.title)).toEqual(["活动介绍", "行程安排", "费用说明", "报名须知", "退费说明"])
    for (const section of page.sections) {
      page.openSection(section.id)
      expect(page.activeSectionId.value).toBe(section.id)
      expect(page.activeSection.value).toEqual(section)
      expect(descriptor.template?.content).toContain(`id="activity-${section.id}"`)
      page.closeSection()
      expect(page.activeSection.value).toBeUndefined()
    }
    expect(scroll).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("preserves encoded session and school when enrollment is available", () => {
    setup().enroll()
    expect(navigate).toHaveBeenCalledWith({ url: "/pages/enrollment/index?sessionId=trip%20%26%201&schoolId=school%20%26%201" })
  })

  it("switches to another real session of the same activity before enrollment", () => {
    trips.value = [
      { ...selectedTrip, activity: { ...selectedTrip.activity, id: "activity" } },
      { ...selectedTrip, session: { id: "trip-2", organizationId: "school & 1" }, activity: { ...selectedTrip.activity, id: "activity" } },
      { ...selectedTrip, session: { id: "other-school", organizationId: "school-2" }, activity: { ...selectedTrip.activity, id: "activity" } },
    ]
    const page = setup()
    expect(page.sessionChoices.value.map((choice) => choice.session.id)).toEqual(["trip & 1", "trip-2"])
    page.selectSession("trip-2")
    page.enroll()
    expect(navigate).toHaveBeenCalledWith({ url: "/pages/enrollment/index?sessionId=trip-2&schoolId=school%20%26%201" })
  })

  it("keeps unavailable enrollment blocked", () => {
    trips.value = [{ ...selectedTrip, canEnroll: false }]
    setup().enroll()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("opens the shared login sheet for a guest before preserving the selected session", () => {
    sessionToken.value = undefined
    const page = setup() as Page & { loginSheetVisible: { value: boolean } }
    page.enroll()
    expect(page.loginSheetVisible.value).toBe(true)
    expect(navigate).not.toHaveBeenCalled()

    page.completeEnrollmentLogin()
    expect(page.loginSheetVisible.value).toBe(false)
    expect(navigate).toHaveBeenCalledWith({ url: "/pages/enrollment/index?sessionId=trip%20%26%201&schoolId=school%20%26%201" })
  })

  it("requires profile completion when a phone session exists but the profile was not saved", () => {
    completedProfile.value = false
    const page = setup() as Page & { loginSheetVisible: { value: boolean } }
    expect(page.loginSheetVisible.value).toBe(false)
    page.enroll()
    expect(page.loginSheetVisible.value).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })
})
