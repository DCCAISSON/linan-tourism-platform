import { createHash, randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { WechatFamilySessionEntity } from "../src/domain/entities/index.js"
import { hashWechatSessionToken } from "../src/modules/wechat/wechat-session-token.js"
import { CONTRACT_SOURCES } from "../src/modules/contracts/contract-sources.js"
import { createContinuationActor, continuationHeaders } from "./business-continuation-fixture.js"
import { dataSource } from "./catalog-trip-fixture.js"
import { createCatalog, createMember, enrollmentBody, virtualPhone, type CatalogFixture } from "./enrollment-consent-fixture.js"
import { createOrder } from "./mock-payment-fixture.js"

export const handwriting = { width: 300, height: 160, strokes: [Array.from({ length: 12 }, (_, index) => ({ x: 10 + index * 10, y: 20 + index * 5 }))] }

export async function contractFamily(app: INestApplication, catalog: CatalogFixture, scope: string) {
  const familyCode = `family-${scope}`
  const headers = { "x-linan-dev-family-identity": familyCode }
  const member = await createMember({ app, scope, headers, catalog, displayName: "合同验收学生", codeSuffix: "1" })
  const enrollment = await request(app.getHttpServer()).post("/enrollments").set(headers).send(enrollmentBody({ catalog, memberIds: [member.id], contactName: "合同验收家长", emergencyContactName: "合同验收联系人", emergencyContactPhone: virtualPhone("0821") })).expect(201)
  const token = randomUUID()
  const actorId = createHash("sha256").update(randomUUID()).digest("hex")
  await dataSource.getRepository(WechatFamilySessionEntity).save({ id: `contract-session-${randomUUID()}`, familyCode, openidHash: actorId,
    tokenHash: hashWechatSessionToken(token), phoneVerified: true, expiresAt: new Date(Date.now() + 7_200_000) })
  const fixture = { headers, enrollmentId: String(enrollment.body.id), tourSessionId: catalog.tourSessionId, participantIds: [] }
  const order = await createOrder(app, fixture, randomUUID())
  return { familyCode, actorId, headers: { Authorization: `Bearer ${token}` }, unverifiedHeaders: headers, orderId: order.id, amountFen: order.amountFen }
}

export async function createContractFixture(app: INestApplication) {
  const scope = `ct-${randomUUID().slice(0, 8)}`
  const catalog = await createCatalog(app, scope)
  const unrelated = await createCatalog(app, `${scope}-other`)
  const permissions = ["configuration.read", "configuration.write", "orders.read", "sensitive_data.read"] as const
  const admin = await createContinuationActor(app, scope, "admin", permissions, { kind: "all", id: null })
  const wrongScope = await createContinuationActor(app, scope, "wrong", permissions, { kind: "school", id: unrelated.schoolId })
  const reader = await createContinuationActor(app, scope, "reader", ["orders.read", "configuration.read"], { kind: "all", id: null })
  const legacy = await contractFamily(app, catalog, `${scope}-legacy`)
  const source = CONTRACT_SOURCES[0]
  const template = await request(app.getHttpServer()).post(`/contracts/staff/sessions/${catalog.tourSessionId}/versions`).set(continuationHeaders(admin))
    .send({ sourceId: source.id, version: "qa-v1", title: "合同验收版本一", bodyText: source.bodyText, reviewed: true }).expect(201)
  await request(app.getHttpServer()).put(`/contracts/staff/sessions/${catalog.tourSessionId}/active`).set(continuationHeaders(admin)).send({ templateId: template.body.id }).expect(200)
  const parent = await contractFamily(app, catalog, `${scope}-parent`)
  const other = await contractFamily(app, unrelated, `${scope}-other`)
  const pending = await contractFamily(app, catalog, `${scope}-pending`)
  const mini = await contractFamily(app, catalog, `${scope}-mini`)
  const mini2 = await contractFamily(app, catalog, `${scope}-mini2`)
  return { scope, catalog, unrelated, admin, wrongScope, reader, legacy, parent, other, pending, mini, mini2, templateId: String(template.body.id) }
}

export async function contractDomainDigest(orderId: string) {
  const queries = {
    order: "select * from orders where id=?",
    lines: "select * from order_lines where order_id=? order by id",
    participants: "select p.* from enrollment_participants p join orders o on o.enrollment_id=p.enrollment_id where o.id=? order by p.id",
    roster: "select r.* from roster_entries r join orders o on o.enrollment_id=r.enrollment_id where o.id=? order by r.id",
  }
  return Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([name, sql]) => {
    const rows: unknown[] = await dataSource.query(sql, [orderId])
    return [name, { count: rows.length, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") }]
  })))
}
