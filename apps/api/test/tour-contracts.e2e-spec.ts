import { createHash, generateKeyPairSync } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { AppModule } from "../src/app.module.js"
import { AuditLogEntity, OrderContractEntity, PaymentEntity } from "../src/domain/entities/index.js"
import { CONTRACT_SOURCES } from "../src/modules/contracts/contract-sources.js"
import { decryptPersonValue } from "../src/modules/enrollment/person-data.js"
import { WechatPayClient } from "../src/modules/wechat/wechat-pay.client.js"
import { WechatPaymentService } from "../src/modules/wechat/wechat-payment.service.js"
import * as payConfig from "../src/modules/wechat/wechat-config.js"
import { continuationHeaders } from "./business-continuation-fixture.js"
import { closeCatalogTripDatabase, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { contractDomainDigest, contractFamily, createContractFixture, handwriting } from "./tour-contract-fixture.js"

describe.skipIf(databaseUrl === undefined)("Tour contract HTTP and database boundaries", () => {
  let app: INestApplication
  let f: Awaited<ReturnType<typeof createContractFixture>>
  let snapshotHash = ""
  let before: Awaited<ReturnType<typeof contractDomainDigest>>
  const provider = { request: vi.fn(async () => ({ prepay_id: "isolated-prepay-no-charge" })) }
  const evidence = new URL("../../../.omo/evidence/interaction-contract-20261003/api/encrypted/", import.meta.url)

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(WechatPayClient).useValue(provider).compile()
    app = module.createNestApplication()
    await app.init()
    f = await createContractFixture(app)
    before = await contractDomainDigest(f.parent.orderId)
    const response = await request(app.getHttpServer()).get(`/orders/${f.parent.orderId}/contract`).set(f.parent.headers).expect(200)
    snapshotHash = String(response.body.contract.snapshotHash)
  }, 90_000)

  afterAll(async () => {
    vi.restoreAllMocks()
    if (f !== undefined) {
      await mkdir(evidence, { recursive: true })
      await writeFile(new URL("fixture.private.json", evidence), JSON.stringify(f, null, 2))
      await writeFile(new URL("receipt.json", evidence), JSON.stringify({ scope: f.scope, realDatabaseAndHttp: true, externalProviderCalls: 0,
        simulatedWechatAdapterCalls: provider.request.mock.calls.length, parentOrderId: f.parent.orderId, pendingOrderId: f.pending.orderId,
        verified: ["legacy/unconfigured null", "scope isolation", "input ink boundary", "snapshot immutability", "body/snapshot/signer name/signature encryption", "idempotent signature", "payment gate", "unchanged amount/participants/roster"], before, after: await contractDomainDigest(f.parent.orderId) }, null, 2))
    }
    if (app !== undefined) await app.close()
    await closeCatalogTripDatabase()
  })

  it("returns sources with original hashes when an authorized staff member reads", async () => {
    const result = await request(app.getHttpServer()).get("/contracts/staff/sources").set(continuationHeaders(f.admin)).expect(200)
    expect(result.body.sources).toHaveLength(2)
    expect(result.body.sources[0].sourceSha256).toBe(CONTRACT_SOURCES[0].sourceSha256)
  })

  it("stores only encrypted body and snapshots when the order contract is captured", async () => {
    const templates: Record<string, unknown>[] = await dataSource.query("select * from contract_template_versions where id=?", [f.templateId])
    const contracts: Record<string, unknown>[] = await dataSource.query("select * from order_contracts where order_id=?", [f.parent.orderId])
    const stored = await dataSource.getRepository(OrderContractEntity).findOneByOrFail({ orderId: f.parent.orderId })
    expect(templates[0]).not.toHaveProperty("body_text")
    expect(contracts[0]).not.toHaveProperty("snapshot")
    expect(contracts[0]).not.toHaveProperty("signer_name")
    expect(JSON.stringify([...templates, ...contracts])).not.toContain(CONTRACT_SOURCES[0].bodyText.slice(0, 100))
    expect(JSON.stringify(contracts)).not.toContain("合同验收学生")
    expect(JSON.stringify(contracts)).not.toContain("Payment Parent")
    const snapshotText = decryptPersonValue(stored.snapshotCiphertext, stored.snapshotKeyVersion)
    expect(createHash("sha256").update(snapshotText).digest("hex")).toBe(stored.snapshotHash)
    const result = await request(app.getHttpServer()).get(path()).set(f.parent.headers).expect(200)
    expect(result.body.contract.template.bodyText).toBe(CONTRACT_SOURCES[0].bodyText)
    expect(createHash("sha256").update(result.body.contract.template.bodyText).digest("hex")).toBe(result.body.contract.template.bodySha256)
    expect(result.body.contract.participants[0].name).toBe("合同验收学生")
  })

  it("leaves legacy and unconfigured orders without contracts when a template is later activated", async () => {
    for (const family of [f.legacy, f.other]) {
      const result = await request(app.getHttpServer()).get(`/orders/${family.orderId}/contract`).set(family.headers).expect(200)
      expect(result.body.contract).toBeNull()
    }
  })

  it("rejects unauthenticated and other-family readers when the contract contains names", async () => {
    await request(app.getHttpServer()).get(path()).expect(401)
    await request(app.getHttpServer()).get(path()).set(f.other.headers).expect(404)
    await request(app.getHttpServer()).post(`${path()}/sign`).set(f.other.headers).send(signInput()).expect(404)
  })

  it("requires verified phone ownership when a family signs", async () => {
    const result = await request(app.getHttpServer()).post(`${path()}/sign`).set(f.parent.unverifiedHeaders).send(signInput()).expect(403)
    expect(result.body.code).toBe("contract_phone_required")
  })

  it("denies unauthorized staff scope and sensitive access when they read contracts", async () => {
    await request(app.getHttpServer()).get(`/contracts/staff/orders/${f.parent.orderId}`).set(continuationHeaders(f.wrongScope)).expect(403)
    await request(app.getHttpServer()).get(`/contracts/staff/orders/${f.parent.orderId}`).set(continuationHeaders(f.reader)).expect(403)
    await request(app.getHttpServer()).get(`/contracts/staff/sessions/${f.catalog.tourSessionId}`).set(continuationHeaders(f.wrongScope)).expect(403)
    await request(app.getHttpServer()).put(`/contracts/staff/sessions/${f.catalog.tourSessionId}/active`).set(continuationHeaders(f.wrongScope)).send({ templateId: null }).expect(403)
  })

  it("rejects blank and oversized handwriting when a signature is submitted", async () => {
    for (const strokes of [[], [Array.from({ length: 5001 }, () => ({ x: 10, y: 20 }))]]) {
      await request(app.getHttpServer()).post(`${path()}/sign`).set(f.parent.headers).send({ ...signInput(), signature: { ...handwriting, strokes } }).expect(400)
    }
  })

  it("rejects stale snapshot hashes when a parent signs", async () => {
    const result = await request(app.getHttpServer()).post(`${path()}/sign`).set(f.parent.headers).send({ ...signInput(), snapshotHash: "a".repeat(64) }).expect(409)
    expect(result.body.code).toBe("contract_snapshot_changed")
  })

  it("keeps the original snapshot when staff activate a new version", async () => {
    const first = await request(app.getHttpServer()).get(path()).set(f.parent.headers).expect(200)
    const next = await request(app.getHttpServer()).post(`/contracts/staff/sessions/${f.catalog.tourSessionId}/versions`).set(continuationHeaders(f.admin))
      .send({ sourceId: CONTRACT_SOURCES[1].id, version: "qa-v2", title: "合同验收版本二", bodyText: CONTRACT_SOURCES[1].bodyText, reviewed: true }).expect(201)
    await request(app.getHttpServer()).put(`/contracts/staff/sessions/${f.catalog.tourSessionId}/active`).set(continuationHeaders(f.admin)).send({ templateId: next.body.id }).expect(200)
    const unchanged = await request(app.getHttpServer()).get(path()).set(f.parent.headers).expect(200)
    expect(unchanged.body).toEqual(first.body)
    const newFamily = await contractFamily(app, f.catalog, `${f.scope}-v2`)
    const changed = await request(app.getHttpServer()).get(`/orders/${newFamily.orderId}/contract`).set(newFamily.headers).expect(200)
    expect(changed.body.contract.template.id).toBe(next.body.id)
    expect(changed.body.contract.template.kind).toBe("staff_recuperation")
  })

  it("blocks unsigned payment before any payment record or external adapter request", async () => {
    const result = await request(app.getHttpServer()).post(`/payments/mock/${f.parent.orderId}`).set(f.parent.headers).send({}).expect(409)
    expect(result.body.code).toBe("contract_signature_required")
    const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    vi.spyOn(payConfig, "loadWechatPayConfig").mockReturnValue({ appId: "isolated", merchantId: "isolated", serialNo: "isolated", privateKey,
      publicKeyId: "isolated", publicKey: "", apiV3Key: "x".repeat(32), notifyUrl: "https://example.invalid/payment", refundNotifyUrl: "https://example.invalid/refund", apiOrigin: "http://127.0.0.1" })
    await expect(app.get(WechatPaymentService).startMiniappPayment({ familyCode: f.parent.familyCode, actorId: f.parent.actorId, phoneVerified: true }, f.parent.orderId, "isolated-openid")).rejects.toMatchObject({ response: { code: "contract_signature_required" } })
    expect(provider.request).not.toHaveBeenCalled()
    expect(await dataSource.manager.countBy(PaymentEntity, { orderId: f.parent.orderId })).toBe(0)
  })

  it("encrypts handwriting and preserves order/participants/roster when the parent signs", async () => {
    const result = await request(app.getHttpServer()).post(`${path()}/sign`).set(f.parent.headers).send(signInput()).expect(201)
    expect(result.body.contract).toMatchObject({ status: "parent_signed_pending_agency", signerName: "合同验收家长", phoneVerified: true, signature: handwriting })
    const stored = await dataSource.getRepository(OrderContractEntity).findOneByOrFail({ orderId: f.parent.orderId })
    expect(stored.signatureCiphertext).not.toContain('"strokes"')
    expect(stored.signatureCiphertext).not.toBeNull()
    const raw: Record<string, unknown>[] = await dataSource.query("select * from order_contracts where order_id=?", [f.parent.orderId])
    expect(JSON.stringify(raw)).not.toContain("合同验收家长")
    expect(raw[0]).not.toHaveProperty("signer_name")
    expect(await contractDomainDigest(f.parent.orderId)).toEqual(before)
  })

  it("replays identical signatures and rejects changed signatures when already signed", async () => {
    const beforeReplay = await dataSource.getRepository(OrderContractEntity).findOneByOrFail({ orderId: f.parent.orderId })
    await request(app.getHttpServer()).post(`${path()}/sign`).set(f.parent.headers).send(signInput()).expect(201)
    await request(app.getHttpServer()).post(`${path()}/sign`).set(f.parent.headers).send({ ...signInput(), signerName: "另一位签字人" }).expect(409)
    const afterReplay = await dataSource.getRepository(OrderContractEntity).findOneByOrFail({ orderId: f.parent.orderId })
    expect(afterReplay).toEqual(beforeReplay)
  })

  it("records an audit when authorized staff read the signed signature", async () => {
    const result = await request(app.getHttpServer()).get(`/contracts/staff/orders/${f.parent.orderId}`).set(continuationHeaders(f.admin)).expect(200)
    expect(result.body.contract.signature).toEqual(handwriting)
    expect(await dataSource.manager.countBy(AuditLogEntity, { targetId: f.parent.orderId, action: "order_contract.sensitive_read", actorId: f.admin.id })).toBe(1)
  })

  it("permits payment preparation when the parent has signed without charging", async () => {
    const prepared = await app.get(WechatPaymentService).startMiniappPayment({ familyCode: f.parent.familyCode, actorId: f.parent.actorId, phoneVerified: true }, f.parent.orderId, "isolated-openid")
    expect(prepared.amountFen).toBe(f.parent.amountFen)
    expect(provider.request).toHaveBeenCalledTimes(1)
    await request(app.getHttpServer()).post(`/payments/mock/${f.parent.orderId}`).set(f.parent.headers).send({}).expect(201)
    expect(await contractDomainDigest(f.parent.orderId)).toEqual(before)
  })

  function path() { return `/orders/${f.parent.orderId}/contract` }
  function signInput() { return { snapshotHash, signerName: "合同验收家长", agreed: true, signature: handwriting } }
})
