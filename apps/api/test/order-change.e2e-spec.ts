import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { OrderChangeRequestEntity } from "../src/domain/entities/order-change-request.entity.js"
import { continuationHeaders } from "./business-continuation-fixture.js"
import { closeCatalogTripDatabase, createCatalogTripApp, databaseUrl, dataSource, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { changeDomainDigests, changeInput, createOrderChangeFixture } from "./order-change-fixture.js"

describe.skipIf(databaseUrl === undefined)("Paid order change requests", () => {
  let app: INestApplication
  let f: Awaited<ReturnType<typeof createOrderChangeFixture>>
  beforeAll(async () => { await initializeCatalogTripDatabase(); app = await createCatalogTripApp(); f = await createOrderChangeFixture(app) }, 90000)
  afterAll(async () => { await app.close(); await closeCatalogTripDatabase() })

  it("requires a family identity when reading order change requests", async () => {
    // Given an unauthenticated client.
    // When it reads change requests.
    // Then the identity boundary rejects it before reading order data.
    await request(app.getHttpServer()).get("/orders/order-change-private/change-requests").expect(401)
  })

  it("denies unverified bearer sessions and development headers when a paid order is owned", async () => {
    await request(app.getHttpServer()).get(path()).set(f.unverified).expect(403)
    await request(app.getHttpServer()).get(path()).set(f.familyA.headers).expect(403)
  })

  it("denies another verified family when it reads or changes the owner's order", async () => {
    await request(app.getHttpServer()).get(path()).set(f.other).expect(404)
    await request(app.getHttpServer()).post(path()).set(f.other).send(changeInput(f)).expect(404)
  })

  it("rejects a line from another order when requesting a replacement", async () => {
    const input = { ...changeInput(f), originalLineId: f.familyB.lines[0]?.lineId }
    const response = await request(app.getHttpServer()).post(path()).set(f.owner).send(input).expect(400)
    expect(response.body.code).toBe("order_change_line_invalid")
  })

  it("preserves original paid snapshots and encrypts proposed credentials when submitting", async () => {
    const input = changeInput(f)
    const response = await request(app.getHttpServer()).post(path()).set(f.owner).send(input).expect(201)
    const stored = await dataSource.getRepository(OrderChangeRequestEntity).findOneByOrFail({ id: response.body.id })
    expect(stored.originalSnapshot.lines).toHaveLength(2)
    expect(stored.originalSnapshot.paidFen).toBe(2400)
    expect(JSON.stringify(response.body).includes(input.participant.identityNumber)).toBe(false)
    expect(JSON.stringify(response.body).includes(input.participant.phone)).toBe(false)
    expect(JSON.stringify(response.body).includes("Ciphertext")).toBe(false)
    expect(JSON.stringify(stored.proposedParticipant).includes(input.participant.identityNumber)).toBe(false)
    expect(stored.proposedParticipant.personData.identityCiphertext.length).toBeGreaterThan(18)
  })

  it("replays the same submission and rejects changed content when an idempotency key is reused", async () => {
    const input = changeInput(f)
    const first = await request(app.getHttpServer()).post(path()).set(f.owner).send(input).expect(201)
    const replay = await request(app.getHttpServer()).post(path()).set(f.owner).send(input).expect(201)
    expect(replay.body.id).toBe(first.body.id)
    await request(app.getHttpServer()).post(path()).set(f.owner).send({ ...input, reason: "不同原因" }).expect(409)
  })

  it("allows an orders reader to read but denies processing and denies an out-of-scope account", async () => {
    const created = await submit()
    await request(app.getHttpServer()).get("/staff/order-changes").set(continuationHeaders(f.reader)).expect(200)
    await review(created.body.id, "approved", 1, f.reader).expect(403)
    await request(app.getHttpServer()).get("/staff/order-changes").set(continuationHeaders(f.wrongScope)).expect(403)
    await review(created.body.id, "approved", 1, f.wrongScope).expect(403)
  })

  it("supplements the same request and preserves the original snapshot when staff ask for information", async () => {
    const created = await submit()
    await review(created.body.id, "needs_information", 1).expect(201)
    const response = await request(app.getHttpServer()).post(`${path()}/${created.body.id}/supplement`).set(f.owner).send({ expectedVersion: 2, reason: "已补充拟参加人联系说明", participant: { ...changeInput(f).participant, displayName: "合成申请人乙" } }).expect(201)
    expect(response.body).toMatchObject({ id: created.body.id, status: "submitted", version: 3, proposedParticipant: { displayName: "合成申请人乙" } })
    expect(response.body.originalSnapshot).toEqual(created.body.originalSnapshot)
    expect(response.body.history.map((entry: { status: string }) => entry.status)).toEqual(["submitted", "needs_information", "submitted"])
    await request(app.getHttpServer()).post(`${path()}/${created.body.id}/supplement`).set(f.owner).send({ expectedVersion: 2, reason: "过期页面" }).expect(409)
  })

  it("records withdrawal and rejects later review when the parent withdraws an open request", async () => {
    const created = await submit()
    const response = await request(app.getHttpServer()).post(`${path()}/${created.body.id}/withdraw`).set(f.owner).send({ expectedVersion: 1 }).expect(201)
    expect(response.body).toMatchObject({ status: "withdrawn", version: 2 })
    await review(created.body.id, "approved", 2).expect(409)
  })

  it("records rejection with an actor and time when staff reject a request", async () => {
    const created = await submit()
    const response = await review(created.body.id, "rejected", 1).expect(201)
    expect(response.body).toMatchObject({ status: "rejected", version: 2 })
    expect(response.body.history[1]).toMatchObject({ actorName: "验收admin", note: "已核对申请材料", action: "reviewed" })
    expect(Number.isFinite(Date.parse(response.body.history[1].at))).toBe(true)
  })

  it("leaves money, official roster, transport and insurance unchanged through submission, approval and processing notes", async () => {
    const before = await changeDomainDigests(f)
    const created = await submit()
    const afterSubmit = await changeDomainDigests(f)
    const approved = await review(created.body.id, "approved", 1).expect(201)
    const afterApproval = await changeDomainDigests(f)
    const noted = await request(app.getHttpServer()).post(`/staff/order-changes/${created.body.id}/notes`).set(continuationHeaders(f.admin)).send({ expectedVersion: 2, note: "已联系申请人，费用与保险待确认；尚未实际更换人员" }).expect(201)
    const afterNote = await changeDomainDigests(f)
    expect(afterSubmit).toEqual(before)
    expect(afterApproval).toEqual(before)
    expect(afterNote).toEqual(before)
    expect(approved.body.status).toBe("approved")
    expect(noted.body).toMatchObject({ status: "approved", version: 3 })
    expect(before["allocations"]?.rows).toBe(5)
    expect(before["insurance_people"]?.rows).toBe(5)
    const directory = new URL("../../../.omo/evidence/product-closure-20261003/roles/manager/order-change/", import.meta.url)
    await mkdir(directory, { recursive: true })
    await writeFile(fileURLToPath(new URL("four-domains-unchanged.json", directory)), JSON.stringify({ scope: f.scope, requestId: created.body.id, before, afterSubmit, afterApproval, afterNote, paidFen: approved.body.originalSnapshot.paidFen, finalStatus: noted.body.status, realExternalCalls: 0 }, null, 2))
  })

  it("submits addition as a pending request without adding paid order lines", async () => {
    const before = await changeDomainDigests(f)
    const response = await request(app.getHttpServer()).post(path()).set(f.owner).send(changeInput(f, "addition")).expect(201)
    expect(response.body).toMatchObject({ kind: "addition", originalLineId: null, status: "submitted" })
    expect(await changeDomainDigests(f)).toEqual(before)
  })

  it("blocks a replacement only for its refunding line and blocks addition for an order with active refunds", async () => {
    const isolated = await createOrderChangeFixture(app)
    const input = changeInput(isolated)
    await request(app.getHttpServer()).post(`/orders/${isolated.familyA.orderId}/refund-applications`).set(isolated.owner).send({ lineIds: [input.originalLineId], reason: "合成退款冲突", idempotencyKey: randomUUID() }).expect(201)
    const target = `/orders/${isolated.familyA.orderId}/change-requests`
    await request(app.getHttpServer()).post(target).set(isolated.owner).send(input).expect(409)
    await request(app.getHttpServer()).post(target).set(isolated.owner).send(changeInput(isolated, "addition")).expect(409)
    const studentLine = isolated.familyA.lines.find((line) => line.kind === "student")?.lineId
    await request(app.getHttpServer()).post(target).set(isolated.owner).send({ ...input, originalLineId: studentLine, idempotencyKey: randomUUID() }).expect(201)
  }, 90000)

  function path(): string { return `/orders/${f.familyA.orderId}/change-requests` }
  function submit() { return request(app.getHttpServer()).post(path()).set(f.owner).send(changeInput(f)).expect(201) }
  function review(id: string, decision: "approved" | "needs_information" | "rejected", expectedVersion: number, actor = f.admin) {
    return request(app.getHttpServer()).post(`/staff/order-changes/${id}/review`).set(continuationHeaders(actor)).send({ expectedVersion, decision, note: "已核对申请材料" })
  }
})
