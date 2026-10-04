import { afterEach, describe, expect, it, vi } from "vitest"
import { addTemplateSchool, linkCatalogTemplate, updateCatalogTemplate } from "../src/api/configuration"
import { parseCatalogTemplate } from "../src/api/configuration.parsers"

afterEach(() => vi.unstubAllGlobals())

describe("shared catalog requests", () => {
  it("carries the viewed version when saving shared content", async () => {
    // Given
    const content = { title: "湿地课程", description: "公共介绍", coverImageUrl: "", expectedVersion: 2 }
    const request = vi.fn(async () => new Response(JSON.stringify({ ...content, id: "template-a", version: 3 }), { status: 200 }))
    vi.stubGlobal("fetch", request)
    // When
    const template = await updateCatalogTemplate("template-a", content)
    // Then
    expect(template.version).toBe(3)
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/catalog-templates/template-a"), expect.objectContaining({ method: "PATCH", body: JSON.stringify(content) }))
  })

  it("does not claim association success when the server refuses it", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "该学校课程编码已存在" }), { status: 409 })))
    // When / Then
    await expect(addTemplateSchool("template-a", { organizationId: "school-a", code: "wetland" })).rejects.toThrow("该学校课程编码已存在")
  })

  it("explicitly unlinks without submitting replacement content", async () => {
    // Given
    const request = vi.fn(async () => new Response(JSON.stringify({ id: "course-a", templateId: null }), { status: 200 }))
    vi.stubGlobal("fetch", request)
    // When
    const item = await linkCatalogTemplate("course-a", null)
    // Then
    expect(item.templateId).toBeNull()
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/catalog-items/course-a/template"), expect.objectContaining({ method: "PUT", body: '{"templateId":null}' }))
  })

  it("rejects a response with no concurrency version", () => {
    // Given / When / Then
    expect(() => parseCatalogTemplate({ id: "template-a", title: "课程" })).toThrow("课程模板响应格式不正确")
  })
})
