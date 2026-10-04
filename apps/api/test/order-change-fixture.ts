import { createHash, randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { WechatFamilySessionEntity } from "../src/domain/entities/wechat-family-session.entity.js"
import { hashWechatSessionToken } from "../src/modules/wechat/wechat-session-token.js"
import { continuationHeaders, createContinuationActor, createContinuationFixture, type ContinuationFixture } from "./business-continuation-fixture.js"
import { dataSource } from "./catalog-trip-fixture.js"
import { virtualPhone, virtualResidentId } from "./enrollment-consent-fixture.js"

export async function verifiedChangeHeaders(familyCode: string, verified = true): Promise<Record<string, string>> {
  const token = randomUUID()
  await dataSource.getRepository(WechatFamilySessionEntity).save({
    id: `order-change-${randomUUID()}`, familyCode, phoneVerified: verified,
    openidHash: createHash("sha256").update(randomUUID()).digest("hex"), tokenHash: hashWechatSessionToken(token),
    phoneHash: createHash("sha256").update(randomUUID()).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000),
  })
  return { Authorization: `Bearer ${token}` }
}

export async function createOrderChangeFixture(app: INestApplication) {
  const f = await createContinuationFixture(app)
  const familyCode = f.familyA.headers["x-linan-dev-family-identity"]
  const otherCode = f.familyB.headers["x-linan-dev-family-identity"]
  if (familyCode === undefined || otherCode === undefined) throw new Error("Synthetic family identity unavailable")
  const owner = await verifiedChangeHeaders(familyCode)
  const other = await verifiedChangeHeaders(otherCode)
  const unverified = await verifiedChangeHeaders(familyCode, false)
  const reader = await createContinuationActor(app, f.scope, "changes-reader", ["orders.read"], { kind: "all", id: null })
  const wrongScope = await createContinuationActor(app, f.scope, "changes-scope", ["orders.read", "roster.correct"], { kind: "school", id: f.unrelated.schoolId })
  const session = f.catalog.tourSessionId
  const headers = continuationHeaders(f.admin)
  const plan = await request(app.getHttpServer()).get(`/transport/sessions/${session}/people-plan`).set(headers).expect(200)
  await request(app.getHttpServer()).put(`/transport/sessions/${session}/person-allocations`).set(headers).send({ expectedPlanVersion: plan.body.planVersion, expectedRosterVersion: plan.body.rosterVersion, assignments: f.initial }).expect(200)
  const current = await request(app.getHttpServer()).get(`/transport/sessions/${session}/people-plan`).set(headers).expect(200)
  await request(app.getHttpServer()).post(`/transport/sessions/${session}/confirmations`).set(headers).send({ expectedPlanVersion: current.body.planVersion, expectedRosterVersion: current.body.rosterVersion }).expect(201)
  const preview = await request(app.getHttpServer()).get(`/insurance/sessions/${session}/preview`).set(headers).expect(200)
  const batch = await request(app.getHttpServer()).post("/insurance/batches").set(headers).send({ tourSessionId: session, expectedRosterVersion: preview.body.rosterVersion, companyTemplateName: null }).expect(201)
  await request(app.getHttpServer()).post(`/insurance/batches/${batch.body.id}/submit`).set(headers).send({ expectedRosterVersion: preview.body.rosterVersion, receiptReference: `local-${f.scope}`, note: "本机合成投保记录" }).expect(201)
  await request(app.getHttpServer()).post(`/insurance/batches/${batch.body.id}/manual-result`).set(headers).send({ success: true, receiptReference: `local-${f.scope}`, policyNumber: `LOCAL-${f.scope}`, coverageStart: "2027-02-01", coverageEnd: "2027-02-02", note: "本机合成人工回执，未向外部发送" }).expect(201)
  return { ...f, owner, other, unverified, reader, wrongScope }
}

export function changeInput(f: ContinuationFixture, kind: "replacement" | "addition" = "replacement") {
  const originalLineId = f.familyA.lines.find((line) => line.kind === "adult")?.lineId
  if (originalLineId === undefined) throw new Error("Synthetic adult order line unavailable")
  return { kind, originalLineId: kind === "replacement" ? originalLineId : null, reason: "合成家庭出行人员调整", idempotencyKey: randomUUID(), participant: { displayName: "合成申请人甲", participantKind: "adult", identityNumber: virtualResidentId("19860101", "981"), phone: virtualPhone("0981") } }
}

export async function changeDomainDigests(f: ContinuationFixture): Promise<Record<string, { readonly rows: number; readonly sha256: string }>> {
  const session = f.catalog.tourSessionId
  const queries = {
    orders: "select o.* from orders o join enrollments e on e.id=o.enrollment_id where e.tour_session_id=? order by o.id",
    order_lines: "select l.* from order_lines l join orders o on o.id=l.order_id join enrollments e on e.id=o.enrollment_id where e.tour_session_id=? order by l.id",
    payments: "select p.* from payments p join orders o on o.id=p.order_id join enrollments e on e.id=o.enrollment_id where e.tour_session_id=? order by p.id",
    refunds: "select r.* from refund_requests r join orders o on o.id=r.order_id join enrollments e on e.id=o.enrollment_id where e.tour_session_id=? order by r.id",
    roster: "select r.* from roster_entries r where r.tour_session_id=? order by r.id",
    enrollments: "select e.* from enrollments e where e.tour_session_id=? order by e.id",
    participants: "select p.* from enrollment_participants p join enrollments e on e.id=p.enrollment_id where e.tour_session_id=? order by p.id",
    allocations: "select a.* from transport_person_allocations a where a.tour_session_id=? order by a.id",
    vehicles: "select v.* from transport_session_vehicles v where v.tour_session_id=? order by v.id",
    transport_plans: "select p.* from transport_plans p where p.tour_session_id=? order by p.tour_session_id",
    transport_confirmations: "select c.* from transport_confirmations c where c.tour_session_id=? order by c.id",
    insurance_batches: "select b.* from insurance_batches b where b.tour_session_id=? order by b.id",
    insurance_people: "select p.* from insurance_batch_people p join insurance_batches b on b.id=p.batch_id where b.tour_session_id=? order by p.id",
    insurance_handoffs: "select h.* from insurance_handoffs h join insurance_batches b on b.id=h.batch_id where b.tour_session_id=? order by h.id",
  }
  const entries = await Promise.all(Object.entries(queries).map(async ([name, sql]) => {
    const rows: unknown[] = await dataSource.query(sql, [session])
    return [name, { rows: rows.length, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") }] as const
  }))
  return Object.fromEntries(entries)
}
