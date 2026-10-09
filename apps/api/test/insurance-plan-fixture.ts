import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { OrderLineEntity } from "../src/domain/entities/index.js"
import { dataSource, DEV_ADMIN_HEADERS } from "./catalog-trip-fixture.js"
import { CONTINUATION_ORIGIN } from "./business-continuation-fixture.js"
import { createCatalog, familyHeader, virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"
import { resetMockPaymentData } from "./mock-payment-fixture.js"
import { payEnrollment } from "./roster-export-fixture.js"

export const INSURANCE_HEADERS = { ...DEV_ADMIN_HEADERS, Origin: CONTINUATION_ORIGIN } as const
export const TEST_INSURANCE_PLAN = { insurerName: "合成保险公司", planName: "合成方案A", coverageSummary: "合成意外伤害保障10万元", notice: "仅用于本地验收" } as const

export async function createInsuranceFixture(app: INestApplication) {
  const scope = `ins-${randomUUID().slice(0, 8)}`
  const catalog = await createCatalog(app, scope)
  const orderId = await payEnrollment({ app, scope, catalog, family: "owner", names: ["本订单学生"], status: "succeeded", identities: [{ participantKind: "student", identityNumber: virtualResidentId("20100101", "831"), phone: virtualPhone("0831") }] })
  const otherOrderId = await payEnrollment({ app, scope, catalog, family: "other", names: ["其他家庭学生"], status: "succeeded", identities: [{ participantKind: "student", identityNumber: virtualResidentId("20100101", "832"), phone: virtualPhone("0832") }] })
  const line = await dataSource.manager.findOneByOrFail(OrderLineEntity, { orderId })
  return { scope, catalog, orderId, otherOrderId, line, owner: familyHeader(scope, "owner"), other: familyHeader(scope, "other") }
}

export type InsuranceFixture = Awaited<ReturnType<typeof createInsuranceFixture>>

export async function createInsuranceBatch(app: INestApplication, sessionId: string) {
  const preview = await request(app.getHttpServer()).get(`/insurance/sessions/${sessionId}/preview`).set(INSURANCE_HEADERS).expect(200)
  const response = await request(app.getHttpServer()).post("/insurance/batches").set(INSURANCE_HEADERS)
    .send({ tourSessionId: sessionId, expectedRosterVersion: preview.body.rosterVersion, companyTemplateName: null }).expect(201)
  return { id: String(response.body.id), rosterVersion: String(preview.body.rosterVersion) }
}

export async function insureBatch(app: INestApplication, batch: { readonly id: string; readonly rosterVersion: string }) {
  await request(app.getHttpServer()).post(`/insurance/batches/${batch.id}/submit`).set(INSURANCE_HEADERS)
    .send({ expectedRosterVersion: batch.rosterVersion, receiptReference: "private-handoff", note: "PRIVATE_STAFF_NOTE" }).expect(201)
  await request(app.getHttpServer()).post(`/insurance/batches/${batch.id}/manual-result`).set(INSURANCE_HEADERS)
    .send({ success: true, policyNumber: "SYNTHETIC-POLICY", receiptReference: "PRIVATE_RECEIPT", coverageStart: "2027-02-01", coverageEnd: "2027-02-02", note: "PRIVATE_STAFF_NOTE" }).expect(201)
}

export async function resetInsuranceFixture(fixture: InsuranceFixture): Promise<void> {
  await dataSource.query("delete from insurance_batches where tour_session_id = ?", [fixture.catalog.tourSessionId])
  await dataSource.query("delete rl from refund_request_lines rl join refund_requests r on r.id=rl.refund_request_id where r.order_id in (?,?)", [fixture.orderId, fixture.otherOrderId])
  await dataSource.query("delete from refund_requests where order_id in (?,?)", [fixture.orderId, fixture.otherOrderId])
  await resetMockPaymentData(fixture.scope)
  await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`staff-${fixture.scope}-%`])
  await dataSource.query("delete from staff_accounts where id like ?", [`staff-${fixture.scope}-%`])
}
