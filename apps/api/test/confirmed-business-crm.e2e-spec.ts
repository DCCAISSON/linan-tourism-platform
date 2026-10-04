import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Test, type TestingModule } from "@nestjs/testing"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDomainDataSource } from "../src/domain/data-source.js"
import { OrganizationEntity } from "../src/domain/entities/organization.entity.js"
import { StaffAccountEntity } from "../src/domain/entities/staff-account.entity.js"
import { BusinessProductEntity } from "../src/domain/entities/business-product.entity.js"
import { BusinessInquiryEntity } from "../src/domain/entities/business-inquiry.entity.js"
import { BusinessFollowupEntity } from "../src/domain/entities/business-followup.entity.js"
import { CrmCustomerEntity } from "../src/domain/entities/crm-customer.entity.js"
import { CrmFollowupEntity } from "../src/domain/entities/crm-followup.entity.js"
import { BusinessInquiryService } from "../src/modules/business/business-inquiry.service.js"
import { CrmReadService } from "../src/modules/crm/crm-read.service.js"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
import { AuditLogService } from "../src/modules/iam/audit-log.service.js"
import type { StaffAccess } from "../src/modules/iam/dev-staff-access.service.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]
const source = createDomainDataSource(databaseUrl ?? "")
const scope = `crm-link-${randomUUID()}`
const organizationId = `${scope}-a`
const otherOrganizationId = `${scope}-b`
const inquiryId = `${scope}-i`
const customerId = `${scope}-c1`
const samePhoneCustomerId = `${scope}-c2`
const foreignCustomerId = `${scope}-c3`
const actorId = `${scope}-s`
const access: StaffAccess = { kind: "administrator", actorId, forcePasswordChange: false, permissionKeys: new Set(["business.followup", "crm.read", "crm.write"]), scopes: [{ kind: "organization", id: organizationId }] }
let moduleFixture: TestingModule
let inquiries: BusinessInquiryService
let crm: CrmReadService

describe.skipIf(databaseUrl === undefined)("explicit inquiry / CRM links with full domain entities", () => {
  beforeAll(async () => {
    await source.initialize()
    await source.runMigrations()
    moduleFixture = await Test.createTestingModule({ providers: [BusinessInquiryService, CrmReadService, AuditLogService, { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => source } }] }).compile()
    inquiries = moduleFixture.get(BusinessInquiryService)
    crm = moduleFixture.get(CrmReadService)
    for (const id of [organizationId, otherOrganizationId]) await source.manager.save(OrganizationEntity, { id, code: id, name: "咨询关联隔离机构" })
    await source.manager.save(Object.assign(new StaffAccountEntity(), { id: actorId, username: actorId, displayName: "关联操作员" }))
    await source.manager.save(Object.assign(new BusinessProductEntity(), { id: `${scope}-p`, organizationId, title: "已有咨询产品" }))
    for (const [id, org] of [[customerId, organizationId], [samePhoneCustomerId, organizationId], [foreignCustomerId, otherOrganizationId]]) {
      await source.manager.save(Object.assign(new CrmCustomerEntity(), { id, organizationId: org, displayName: id === customerId ? "既有客户甲" : "既有客户乙", birthDate: "1980-01-01", adultConfirmedBy: actorId, phoneCiphertext: "isolated-unread-ciphertext", phoneMasked: "138****0000", requestKey: id, requestHash: "0".repeat(64) }))
    }
    await source.manager.save(Object.assign(new BusinessInquiryEntity(), { id: inquiryId, productId: `${scope}-p`, organizationId, contactName: "咨询联系人", phone: "13800000000", request: "保留原始需求", idempotencyKey: inquiryId, requestHash: "0".repeat(64) }))
    await source.manager.save(Object.assign(new BusinessFollowupEntity(), { id: `${scope}-bf`, inquiryId, ownerStaffAccountId: actorId, actorId, idempotencyKey: `${scope}-bf`, requestHash: "0".repeat(64), note: "原有咨询跟进" }))
    await source.manager.save(Object.assign(new CrmFollowupEntity(), { id: `${scope}-cf`, customerId, content: "原有客户跟进", createdBy: actorId, requestKey: `${scope}-cf`, requestHash: "0".repeat(64) }))
  }, 60000)

  afterAll(async () => {
    if (moduleFixture) await moduleFixture.close()
    if (!source.isInitialized) return
    await source.query("DELETE FROM business_inquiry_customer_links WHERE inquiry_id = ?", [inquiryId])
    await source.query("DELETE FROM business_followups WHERE inquiry_id = ?", [inquiryId])
    await source.query("DELETE FROM business_inquiries WHERE id = ?", [inquiryId])
    await source.query("DELETE FROM business_products WHERE id = ?", [`${scope}-p`])
    await source.query("DELETE FROM crm_followups WHERE customer_id IN (?, ?, ?)", [customerId, samePhoneCustomerId, foreignCustomerId])
    await source.query("DELETE FROM crm_customers WHERE id IN (?, ?, ?)", [customerId, samePhoneCustomerId, foreignCustomerId])
    await source.query("DELETE FROM audit_logs WHERE organization_id IN (?, ?)", [organizationId, otherOrganizationId])
    await source.query("DELETE FROM staff_accounts WHERE id = ?", [actorId])
    await source.query("DELETE FROM organizations WHERE id IN (?, ?)", [organizationId, otherOrganizationId])
    await source.destroy()
  })

  it("exposes only same-organization masked candidates and rejects either single-side permission", async () => {
    const candidates = await inquiries.customerCandidates(access, inquiryId)
    expect(candidates.map(row => row.id).sort()).toEqual([customerId, samePhoneCustomerId].sort())
    expect(JSON.stringify(candidates)).not.toContain("13800000000")
    expect(candidates.every(row => Object.keys(row).sort().join() === "displayName,id,phoneMasked")).toBe(true)
    for (const permissionKeys of [new Set(["business.followup"] as const), new Set(["crm.read", "crm.write"] as const)]) {
      await expect(inquiries.customerCandidates({ ...access, permissionKeys }, inquiryId)).rejects.toThrow()
      await expect(inquiries.linkCustomer({ ...access, permissionKeys }, inquiryId, { customerId, expectedVersion: 1 })).rejects.toThrow()
    }
    await expect(inquiries.linkCustomer(access, inquiryId, { customerId: foreignCustomerId, expectedVersion: 1 })).rejects.toThrow("本机构客户不存在")
    await expect(inquiries.linkCustomer(access, inquiryId, { customerId: `${scope}-missing`, expectedVersion: 1 })).rejects.toThrow("本机构客户不存在")
    await expect(inquiries.customerCandidates({ ...access, scopes: [{ kind: "organization", id: otherOrganizationId }] }, inquiryId)).rejects.toThrow()
  })

  it("saves and rereads both sides without merging same-phone customers, then retains unlink history", async () => {
    const beforeCount = await source.getRepository(CrmCustomerEntity).countBy({ organizationId })
    await expect(inquiries.linkCustomer(access, inquiryId, { customerId, expectedVersion: 1 })).resolves.toMatchObject({ version: 2 })
    await expect(inquiries.linkCustomer(access, inquiryId, { customerId: null, expectedVersion: 1 })).rejects.toThrow("咨询已变更，请刷新后关联")
    const inquiry = await inquiries.detail(access, inquiryId)
    const customer = await crm.detail(access, customerId)
    expect(inquiry.linkedCustomer?.id).toBe(customerId)
    expect(inquiry.history[0]?.note).toBe("原有咨询跟进")
    expect(customer.inquiries[0]).toMatchObject({ id: inquiryId, linked: true, history: [{ note: "原有咨询跟进" }] })
    expect(customer.followups[0]?.content).toBe("原有客户跟进")
    expect((await crm.detail(access, samePhoneCustomerId)).inquiries).toEqual([])
    expect(await source.getRepository(CrmCustomerEntity).countBy({ organizationId })).toBe(beforeCount)
    const onlyBusiness = await inquiries.detail({ ...access, permissionKeys: new Set(["business.followup"]) }, inquiryId)
    expect(onlyBusiness.linkedCustomer).toBeNull()
    expect(onlyBusiness.customerHistory).toEqual([])
    expect(onlyBusiness).not.toHaveProperty("customerId")
    const onlyCrm = await crm.detail({ ...access, permissionKeys: new Set(["crm.read"]) }, customerId)
    expect(onlyCrm.inquiries).toEqual([])
    await expect(inquiries.linkCustomer({ ...access, permissionKeys: new Set(["business.followup", "crm.read"]) }, inquiryId, { customerId: null, expectedVersion: 2 })).rejects.toThrow()
    await inquiries.linkCustomer(access, inquiryId, { customerId: null, expectedVersion: 2 })
    const unlinked = await inquiries.detail(access, inquiryId)
    const retained = await crm.detail(access, customerId)
    expect(unlinked.linkedCustomer).toBeNull()
    expect(unlinked.customerHistory.map(row => row.action)).toEqual(["linked", "unlinked"])
    expect(retained.inquiries[0]?.linked).toBe(false)
    expect(retained.inquiries[0]?.customerHistory.map(row => row.action)).toEqual(["linked", "unlinked"])
    const audit: { action: string }[] = await source.query("SELECT action FROM audit_logs WHERE organization_id = ? AND target_type = 'business_inquiry_customer_link' ORDER BY created_at", [organizationId])
    expect(audit.map(row => row.action)).toEqual(["business.inquiry.customer.linked", "business.inquiry.customer.unlinked"])
    const evidence = fileURLToPath(new URL("../../../.omo/evidence/confirmed-business-20260927/crm/", import.meta.url))
    await mkdir(evidence, { recursive: true })
    await writeFile(`${evidence}/reciprocal-history.json`, JSON.stringify({ beforeCount, afterCount: await source.getRepository(CrmCustomerEntity).countBy({ organizationId }), inquiryHistory: unlinked.customerHistory, customerInquiries: retained.inquiries, audit }, null, 2))
  })

  it("serializes competing associations against the same inquiry version", async () => {
    const results = await Promise.allSettled([inquiries.linkCustomer(access, inquiryId, { customerId, expectedVersion: 3 }), inquiries.linkCustomer(access, inquiryId, { customerId: samePhoneCustomerId, expectedVersion: 3 })])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    expect((await inquiries.detail(access, inquiryId)).version).toBe(4)
  })
})
