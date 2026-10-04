import { readFileSync } from "node:fs"
import { compileTemplate, parse } from "vue/compiler-sfc"
import { describe, expect, it } from "vitest"

const source = readFileSync(new URL("../src/components/ConsultationEntry.vue", import.meta.url), "utf8")

describe("native consultation entry", () => {
  it("uses a dismissible sheet and sends only an anonymous contextual source to WeChat customer service", () => {
    expect(source).toContain('v-if="visible"')
    expect(source).toContain('@tap="close"')
    expect(source).toContain('open-type="contact"')
    expect(source).toContain(':session-from="sessionFrom(topic)"')
    expect(source).toContain('JSON.stringify({ source: props.context?.source ?? "unknown", id: props.context?.id ?? ""')
    expect(source).not.toContain("客服电话")
    expect(source).not.toContain("在线客服")
  })

  it("offers concrete consultation topics without modelling a conversation or mutating a page action", () => {
    expect(source).toContain("行程与集合安排")
    expect(source).toContain("报名与费用说明")
    expect(source).toContain("订单与行前准备")
    expect(source).not.toContain("聊天记录")
    expect(source).not.toContain("navigateTo")
    expect(source).not.toContain("submit")
  })

  it("compiles the real Vue template and is placed on the home and every contextual detail surface", () => {
    const { descriptor } = parse(source)
    const compiled = compileTemplate({ id: "consultation-entry", source: descriptor.template?.content ?? "", filename: "ConsultationEntry.vue" })
    expect(compiled.errors).toEqual([])
    const homeSource = readFileSync(new URL("../src/pages/index/index.vue", import.meta.url), "utf8")
    expect(homeSource).toContain("ConsultationEntry")
    for (const [page, context] of [
      ["activities/detail.vue", "source: 'activity'"],
      ["business/detail.vue", "source: 'business'"],
      ["orders/detail.vue", "source: 'order'"],
      ["orders/pretrip.vue", "source: 'pretrip'"],
    ] as const) {
      const pageSource = readFileSync(new URL(`../src/pages/${page}`, import.meta.url), "utf8")
      expect(pageSource).toContain("ConsultationEntry")
      expect(pageSource).toContain(context)
    }
  })
})
