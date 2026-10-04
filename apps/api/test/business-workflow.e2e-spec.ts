import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BusinessFollowupEntity, BusinessInquiryEntity, BusinessProductEntity, CrmCustomerEntity, OrderEntity, OrganizationEntity, StaffAccountEntity, StaffAccountPermissionEntity, StaffAccountScopeEntity, StaffSessionEntity } from "../src/domain/entities/index.js"
import { hashToken, STAFF_SESSION_COOKIE } from "../src/modules/iam/staff-session-token.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"

const origin = "http://127.0.0.1:5173"
const contactPhone = "13800001111"
const literalText = '<img src=x onerror="window.businessInjected=true">咨询长文本'
let app: INestApplication
let organizationId: string
let otherOrganizationId: string
let operator: { readonly id: string; readonly headers: { readonly Cookie: string; readonly Origin: string } }
let candidate: typeof operator
let inquiryId: string
let productId: string
let accountIds: string[] = []
let oldOrigin: string | undefined

describe.skipIf(databaseUrl === undefined)("business workflow with scoped staff cookies", () => {
  beforeAll(async () => {
    oldOrigin = process.env["ADMIN_WEB_ORIGIN"]
    process.env["ADMIN_WEB_ORIGIN"] = origin
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  })
  beforeEach(async () => {
    accountIds = []
    organizationId = `business-org-${randomUUID()}`
    otherOrganizationId = `business-org-${randomUUID()}`
    await dataSource.manager.save(OrganizationEntity, [
      { id: organizationId, code: organizationId, name: "业务机构甲" },
      { id: otherOrganizationId, code: otherOrganizationId, name: "业务机构乙" },
    ])
    operator = await staff(organizationId, ["business.read", "business.write", "business.followup"], "业务经办")
    candidate = await staff(organizationId, ["business.followup"], "跟进负责人甲")
    const product = await request(app.getHttpServer()).post("/business/staff/products").set(operator.headers).send(productInput(organizationId)).expect(201)
    productId = String(product.body.id)
    const inquiry = await request(app.getHttpServer()).post(`/business/products/${productId}/inquiries`).send({ idempotencyKey: randomUUID(), customerType: "organization", organizationName: "咨询单位", contactName: "联系人员", phone: contactPhone, request: literalText }).expect(201)
    inquiryId = String(inquiry.body.id)
  })
  afterEach(async () => {
    await dataSource.query("DELETE bf FROM business_followups bf JOIN business_inquiries bi ON bi.id=bf.inquiry_id WHERE bi.organization_id IN (?,?)", [organizationId, otherOrganizationId])
    await dataSource.query("DELETE FROM business_inquiries WHERE organization_id IN (?,?)", [organizationId, otherOrganizationId])
    await dataSource.query("DELETE FROM business_products WHERE organization_id IN (?,?)", [organizationId, otherOrganizationId])
    await dataSource.query("DELETE FROM audit_logs WHERE organization_id IN (?,?)", [organizationId, otherOrganizationId])
    for (const id of accountIds) {
      await dataSource.manager.delete(StaffSessionEntity, { staffAccountId: id })
      await dataSource.manager.delete(StaffAccountScopeEntity, { staffAccountId: id })
      await dataSource.manager.delete(StaffAccountPermissionEntity, { staffAccountId: id })
      await dataSource.manager.delete(StaffAccountEntity, { id })
    }
    await dataSource.manager.delete(OrganizationEntity, [organizationId, otherOrganizationId])
  })
  afterAll(async () => {
    await app?.close()
    await closeCatalogTripDatabase()
    if (oldOrigin === undefined) delete process.env["ADMIN_WEB_ORIGIN"]
    else process.env["ADMIN_WEB_ORIGIN"] = oldOrigin
  })

  it("lists only eligible scoped names for a followup-only caller", async () => {
    const outsider = await staff(otherOrganizationId, ["business.followup"], "其他机构人员")
    const disabled = await staff(organizationId, ["business.followup"], "停用人员")
    await dataSource.manager.update(StaffAccountEntity, disabled.id, { status: "disabled" })
    const expired = await staff(organizationId, ["business.followup"], "到期人员")
    await dataSource.manager.update(StaffAccountEntity, expired.id, { expiresAt: new Date("2000-01-01T00:00:00Z") })
    const readOnly = await staff(organizationId, ["business.read"], "无跟进权限人员")

    const response = await request(app.getHttpServer()).get(`/business/staff/inquiries/${inquiryId}/owners`).set(candidate.headers).expect(200)

    expect(response.body).toEqual(expect.arrayContaining([{ id: operator.id, displayName: "业务经办" }, { id: candidate.id, displayName: "跟进负责人甲" }]))
    const returnedIds: readonly string[] = response.body.map((row: { readonly id: string }) => row.id)
    for (const disallowed of [outsider, disabled, expired, readOnly]) expect(returnedIds).not.toContain(disallowed.id)
    for (const row of response.body) expect(Object.keys(row).sort()).toEqual(["displayName", "id"])
  })

  it.each(["disabled", "expired", "permission", "scope"] as const)("rejects the prior owner choice when eligibility changes: %s", async change => {
    await request(app.getHttpServer()).get(`/business/staff/inquiries/${inquiryId}/owners`).set(operator.headers).expect(200)
    switch (change) {
      case "disabled": await dataSource.manager.update(StaffAccountEntity, candidate.id, { status: "disabled" }); break
      case "expired": await dataSource.manager.update(StaffAccountEntity, candidate.id, { expiresAt: new Date("2000-01-01T00:00:00Z") }); break
      case "permission": await dataSource.manager.delete(StaffAccountPermissionEntity, { staffAccountId: candidate.id, permissionKey: "business.followup" }); break
      case "scope": await dataSource.manager.update(StaffAccountScopeEntity, { staffAccountId: candidate.id }, { scopeId: otherOrganizationId }); break
    }

    await request(app.getHttpServer()).post(`/business/staff/inquiries/${inquiryId}/followups`).set(operator.headers).send(followup()).expect(403)

    expect(await dataSource.manager.countBy(BusinessFollowupEntity, { inquiryId })).toBe(0)
    expect((await dataSource.manager.findOneByOrFail(BusinessInquiryEntity, { id: inquiryId })).version).toBe(1)
  })

  it("denies another organization and a caller whose followup permission was removed", async () => {
    const outsider = await staff(otherOrganizationId, ["business.followup", "business.write"], "机构乙经办")

    for (const suffix of ["", "/owners"]) await request(app.getHttpServer()).get(`/business/staff/inquiries/${inquiryId}${suffix}`).set(outsider.headers).expect(403)
    await request(app.getHttpServer()).post(`/business/staff/inquiries/${inquiryId}/followups`).set(outsider.headers).send(followup()).expect(403)
    await dataSource.manager.delete(StaffAccountPermissionEntity, { staffAccountId: candidate.id, permissionKey: "business.followup" })
    await request(app.getHttpServer()).get(`/business/staff/inquiries/${inquiryId}/owners`).set(candidate.headers).expect(403)

    expect(await dataSource.manager.countBy(BusinessFollowupEntity, { inquiryId })).toBe(0)
  })

  it("persists audited detail and history while masking lists and rejecting stale versions", async () => {
    const crmCount = await dataSource.manager.count(CrmCustomerEntity)
    const orderCount = await dataSource.manager.count(OrderEntity)
    const input = followup()
    await request(app.getHttpServer()).post(`/business/staff/inquiries/${inquiryId}/followups`).set(operator.headers).send(input).expect(201)
    await request(app.getHttpServer()).post(`/business/staff/inquiries/${inquiryId}/followups`).set(operator.headers).send(input).expect(201)

    await request(app.getHttpServer()).post(`/business/staff/inquiries/${inquiryId}/followups`).set(operator.headers).send({ ...followup(), note: "旧版本修改" }).expect(409)
    await request(app.getHttpServer()).post(`/business/staff/inquiries/${inquiryId}/followups`).set(operator.headers).send({ ...input, note: "重放内容不一致" }).expect(409)
    await request(app.getHttpServer()).post(`/business/staff/inquiries/${inquiryId}/followups`).set(operator.headers).send({ ...followup(), expectedVersion: 2, ownerStaffAccountId: "missing-owner" }).expect(403)
    const detail = await request(app.getHttpServer()).get(`/business/staff/inquiries/${inquiryId}`).set(operator.headers).expect(200)
    const list = await request(app.getHttpServer()).get("/business/staff/inquiries").set(operator.headers).expect(200)

    expect(detail.body).toMatchObject({ phone: contactPhone, request: literalText, productTitle: "单位疗休养咨询", ownerDisplayName: "跟进负责人甲", version: 2, status: "processing", history: [expect.objectContaining({ note: literalText, ownerDisplayName: "跟进负责人甲" })] })
    expect(list.body).toEqual([expect.objectContaining({ phone: "138****1111" })])
    expect(await dataSource.manager.countBy(BusinessFollowupEntity, { inquiryId })).toBe(1)
    const audits: readonly { readonly action: string }[] = await dataSource.query("SELECT action FROM audit_logs WHERE organization_id=? AND target_id=?", [organizationId, inquiryId])
    expect(audits.map(row => row.action)).toEqual(expect.arrayContaining(["business.contact.read", "business.inquiry.followup"]))
    expect(await dataSource.manager.count(CrmCustomerEntity)).toBe(crmCount)
    expect(await dataSource.manager.count(OrderEntity)).toBe(orderCount)
  })

  it("maintains existing products within write scope and rejects stale or unauthorized updates", async () => {
    const input = productInput(organizationId)
    const options = await request(app.getHttpServer()).get("/business/staff/organizations").set(operator.headers).expect(200)
    expect(options.body).toEqual([{ id: organizationId, name: "业务机构甲" }])

    await request(app.getHttpServer()).put(`/business/staff/products/${productId}`).set(operator.headers).send({ ...input, title: "修改后的业务内容", expectedVersion: 1 }).expect(200)
    await request(app.getHttpServer()).put(`/business/staff/products/${productId}`).set(operator.headers).send({ ...input, expectedVersion: 1 }).expect(409)
    await request(app.getHttpServer()).put(`/business/staff/products/${productId}`).set(candidate.headers).send({ ...input, expectedVersion: 2 }).expect(403)
    await request(app.getHttpServer()).post("/business/staff/products").set(operator.headers).send(productInput(otherOrganizationId)).expect(403)
    const outsider = await staff(otherOrganizationId, ["business.write"], "其他机构编辑")
    await request(app.getHttpServer()).put(`/business/staff/products/${productId}`).set(outsider.headers).send({ ...input, expectedVersion: 2 }).expect(403)
    const read = await request(app.getHttpServer()).get(`/business/products/${productId}`).expect(200)

    expect(read.body).toMatchObject({ title: "修改后的业务内容", version: 2, organizationId })
    expect(await dataSource.manager.countBy(BusinessProductEntity, { organizationId })).toBe(1)
  })
})

async function staff(scopeId: string, permissions: readonly string[], displayName: string) {
  const id = `business-staff-${randomUUID()}`
  accountIds.push(id)
  await dataSource.manager.save(StaffAccountEntity, { id, username: id, displayName, passwordHash: "isolated-test-session", status: "active", forcePasswordChange: false, failedLoginAttempts: 0, permissionsVersion: 1 })
  for (const permissionKey of permissions) await dataSource.manager.save(StaffAccountPermissionEntity, { id: randomUUID(), staffAccountId: id, permissionKey })
  await dataSource.manager.save(StaffAccountScopeEntity, { id: randomUUID(), staffAccountId: id, scopeKind: "organization", scopeId })
  const token = randomUUID()
  await dataSource.manager.save(StaffSessionEntity, { id: randomUUID(), staffAccountId: id, tokenHash: hashToken(token), permissionsVersion: 1, expiresAt: new Date(Date.now() + 60 * 60 * 1000), revokedAt: null })
  return { id, headers: { Cookie: `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}`, Origin: origin } }
}

function productInput(id: string) {
  return { organizationId: id, category: "wellness", title: "单位疗休养咨询", offering: "集体行程", content: "联系工作人员了解行程", referencePriceFen: null, customerServicePhone: "", bookingUrl: "", bookingAuthorized: false, media: [], mediaAuthorized: false, status: "published" }
}

function followup() {
  return { idempotencyKey: randomUUID(), expectedVersion: 1, status: "processing", ownerStaffAccountId: candidate.id, note: literalText }
}
