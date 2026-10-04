import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { CatalogContentTemplateEntity } from "../src/domain/entities/catalog-content-template.entity.js"
import { CatalogItemEntity } from "../src/domain/entities/catalog-item.entity.js"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase, resetCatalogTripData } from "./catalog-trip-fixture.js"

describe.skipIf(databaseUrl === undefined)("shared course templates with real persistence", () => {
  let app: INestApplication
  let scope: string
  let templateId: string
  let courseA: CatalogItemEntity
  let courseB: CatalogItemEntity

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  })

  beforeEach(async () => {
    scope = createScope()
    const created = await request(app.getHttpServer()).post("/catalog-templates").set(DEV_ADMIN_HEADERS)
      .send({ title: `课程-${scope}`, description: "原共享内容", coverImageUrl: "" }).expect(201)
    templateId = String(created.body.id)
    const courses: CatalogItemEntity[] = []
    for (const suffix of ["a", "b"]) {
      const school = await request(app.getHttpServer()).post("/schools").set(DEV_ADMIN_HEADERS)
        .send({ code: `school-${scope}-${suffix}`, name: `验收学校${suffix}` }).expect(201)
      const result = await request(app.getHttpServer()).post(`/catalog-templates/${templateId}/schools`).set(DEV_ADMIN_HEADERS)
        .send({ organizationId: String(school.body.id), code: `catalog-${scope}-${suffix}` }).expect(201)
      courses.push(await dataSource.manager.findOneByOrFail(CatalogItemEntity, { id: String(result.body.id) }))
    }
    const first = courses[0]
    const second = courses[1]
    if (first === undefined || second === undefined) throw new Error("Two isolated school courses are required")
    courseA = first
    courseB = second
  })

  afterEach(async () => {
    await resetCatalogTripData(scope)
    await dataSource.manager.delete(CatalogContentTemplateEntity, { id: templateId })
  })
  afterAll(async () => { await app.close(); await closeCatalogTripDatabase() })

  it("updates linked content without changing either school's catalog identity", async () => {
    const response = await request(app.getHttpServer()).patch(`/catalog-templates/${templateId}`).set(DEV_ADMIN_HEADERS)
      .send({ title: "共同新名称", description: "共同新介绍", coverImageUrl: "", expectedVersion: 1 }).expect(200)
    expect(response.body.version).toBe(2)
    for (const original of [courseA, courseB]) {
      const current = await dataSource.manager.findOneByOrFail(CatalogItemEntity, { id: original.id })
      expect(current).toMatchObject({ id: original.id, organizationId: original.organizationId, code: original.code,
        status: original.status, templateId, title: "共同新名称", description: "共同新介绍" })
    }
  })

  it("lets only one concurrent editor save the version they both viewed", async () => {
    const attempts = await Promise.all(["编辑甲", "编辑乙"].map(title => request(app.getHttpServer())
      .patch(`/catalog-templates/${templateId}`).set(DEV_ADMIN_HEADERS)
      .send({ title, description: title, coverImageUrl: "", expectedVersion: 1 })))
    expect(attempts.map(response => response.status).sort()).toEqual([200, 409])
    const template = await dataSource.manager.findOneByOrFail(CatalogContentTemplateEntity, { id: templateId })
    const courses = await dataSource.manager.findBy(CatalogItemEntity, { templateId })
    expect(courses.every(course => course.title === template.title && course.description === template.description)).toBe(true)
    expect(template.version).toBe(2)
  })

  it("rejects direct content changes while a catalog remains linked", async () => {
    await request(app.getHttpServer()).patch(`/catalog-items/${courseA.id}`).set(DEV_ADMIN_HEADERS)
      .send({ description: "局部覆盖" }).expect(409)
    expect((await dataSource.manager.findOneByOrFail(CatalogItemEntity, { id: courseA.id })).description).toBe("原共享内容")
  })

  it("retains local content after unlinking while the other school keeps syncing", async () => {
    await request(app.getHttpServer()).put(`/catalog-items/${courseB.id}/template`).set(DEV_ADMIN_HEADERS).send({ templateId: null }).expect(200)
    await request(app.getHttpServer()).patch(`/catalog-items/${courseB.id}`).set(DEV_ADMIN_HEADERS).send({ description: "本校独立内容" }).expect(200)
    await request(app.getHttpServer()).patch(`/catalog-templates/${templateId}`).set(DEV_ADMIN_HEADERS)
      .send({ title: "共同新名称", description: "共同新介绍", coverImageUrl: "", expectedVersion: 1 }).expect(200)
    expect((await dataSource.manager.findOneByOrFail(CatalogItemEntity, { id: courseB.id })).description).toBe("本校独立内容")
    expect((await dataSource.manager.findOneByOrFail(CatalogItemEntity, { id: courseA.id })).description).toBe("共同新介绍")
  })

  it("does not overwrite an existing school course when its code is duplicated", async () => {
    await request(app.getHttpServer()).post(`/catalog-templates/${templateId}/schools`).set(DEV_ADMIN_HEADERS)
      .send({ organizationId: courseA.organizationId, code: courseA.code }).expect(409)
    expect(await dataSource.manager.countBy(CatalogItemEntity, { templateId })).toBe(2)
    expect(await dataSource.manager.findOneByOrFail(CatalogItemEntity, { id: courseA.id })).toEqual(courseA)
  })
})
