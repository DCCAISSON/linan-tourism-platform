import {
  DOMAIN_POLICY_VERSION,
  DOMAIN_SCHEMA_VERSION,
  ENROLLMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  ROSTER_STATUS,
  TOUR_SESSION_STATUS,
  makeCnyFen,
  transitionOrderStatus,
  transitionPaymentStatus,
} from "@linan/contracts"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { EntityManager } from "typeorm"
import { createDomainDataSource } from "../src/domain/data-source.js"
import {
  AuditLogEntity,
  CatalogItemEntity,
  ConsentRecordEntity,
  EnrollmentEntity,
  OrderEntity,
  OrganizationEntity,
  PaymentEntity,
  RosterEntryEntity,
  TourSessionEntity,
} from "../src/domain/entities/index.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]

async function saveEnrollmentBase(manager: EntityManager, scope: string): Promise<void> {
  await manager.save(OrganizationEntity, {
    id: `org-${scope}`,
    code: `org-${scope}`,
    name: "Linan Domain Test Organization",
  })
  await manager.save(CatalogItemEntity, {
    id: `catalog-${scope}`,
    organizationId: `org-${scope}`,
    code: `catalog-${scope}`,
    title: "Qingshan Lake Day Tour",
    status: "active",
    policyVersion: DOMAIN_POLICY_VERSION,
  })
  await manager.save(TourSessionEntity, {
    id: `session-${scope}`,
    organizationId: `org-${scope}`,
    catalogItemId: `catalog-${scope}`,
    code: `session-${scope}`,
    status: TOUR_SESSION_STATUS.published,
    priceFen: 12_345,
    capacity: 20,
    startsAt: new Date("2026-10-01T01:00:00.000Z"),
    endsAt: new Date("2026-10-01T09:00:00.000Z"),
    policyVersion: DOMAIN_POLICY_VERSION,
  })
  await manager.save(EnrollmentEntity, {
    id: `enrollment-${scope}`,
    organizationId: `org-${scope}`,
    tourSessionId: `session-${scope}`,
    code: `enrollment-${scope}`,
    contactName: "Contact Person",
    participantCount: 2,
    status: ENROLLMENT_STATUS.confirmed,
    policyVersion: DOMAIN_POLICY_VERSION,
  })
}

async function savePendingOrder(
  manager: EntityManager,
  scope: string,
  requestIdempotencyKey: string,
): Promise<void> {
  await saveEnrollmentBase(manager, scope)
  await manager.save(OrderEntity, {
    id: `order-${scope}`,
    organizationId: `org-${scope}`,
    enrollmentId: `enrollment-${scope}`,
    code: `order-${scope}`,
    requestIdempotencyKey,
    payerName: "Payer Person",
    status: ORDER_STATUS.pendingPayment,
    amountFen: 100,
    paidFen: 0,
    policyVersion: DOMAIN_POLICY_VERSION,
  })
}

describe.skipIf(databaseUrl === undefined)("Domain contract persistence", () => {
  const dataSource = createDomainDataSource(databaseUrl ?? "")

  beforeAll(async () => {
    await dataSource.initialize()
    await dataSource.runMigrations()
  })

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  })

  it("keeps synchronize disabled and runs the first migration transactionally", () => {
    expect(dataSource.options.synchronize).toBe(false)
    expect(dataSource.options.migrationsTransactionMode).toBe("all")
    expect(dataSource.hasMetadata(OrganizationEntity)).toBe(true)
    expect(dataSource.hasMetadata(PaymentEntity)).toBe(true)
    expect(dataSource.hasMetadata(AuditLogEntity)).toBe(true)
  })

  it("stores paid enrollment with separate payer contact participant and consent versions", async () => {
    const scope = randomUUID()
    const money = makeCnyFen(12_345)
    const orderState = transitionOrderStatus(ORDER_STATUS.pendingPayment, ORDER_STATUS.paid)
    const paymentState = transitionPaymentStatus(PAYMENT_STATUS.pending, PAYMENT_STATUS.succeeded)

    expect(money.ok).toBe(true)
    expect(orderState.ok).toBe(true)
    expect(paymentState.ok).toBe(true)

    await dataSource.transaction(async (manager) => {
      await saveEnrollmentBase(manager, scope)
      await manager.save(OrderEntity, {
        id: `order-${scope}`,
        organizationId: `org-${scope}`,
        enrollmentId: `enrollment-${scope}`,
        code: `order-${scope}`,
        requestIdempotencyKey: `request-${scope}`,
        payerName: "Payer Person",
        status: orderState.ok ? orderState.value : ORDER_STATUS.pendingPayment,
        amountFen: money.ok ? money.value.amount : 0,
        paidFen: money.ok ? money.value.amount : 0,
        policyVersion: DOMAIN_POLICY_VERSION,
      })
      await manager.save(PaymentEntity, {
        id: `payment-${scope}`,
        organizationId: `org-${scope}`,
        orderId: `order-${scope}`,
        paymentNo: `payment-${scope}`,
        providerTransactionId: `provider-txn-${scope}`,
        providerEventId: `provider-event-${scope}`,
        status: paymentState.ok ? paymentState.value : PAYMENT_STATUS.pending,
        amountFen: money.ok ? money.value.amount : 0,
        channel: "manual_test",
        policyVersion: DOMAIN_POLICY_VERSION,
      })
      await manager.save(RosterEntryEntity, {
        id: `roster-${scope}`,
        organizationId: `org-${scope}`,
        tourSessionId: `session-${scope}`,
        enrollmentId: `enrollment-${scope}`,
        displayName: "Participant Person",
        credentialHash: `credential-${scope}`,
        status: ROSTER_STATUS.pending,
        policyVersion: DOMAIN_POLICY_VERSION,
      })
      await manager.save(ConsentRecordEntity, {
        id: `consent-${scope}`,
        organizationId: `org-${scope}`,
        subjectId: `enrollment-${scope}`,
        purpose: "roster_contact",
        granted: true,
        agreementVersion: "agreement-v1",
        schemaVersion: DOMAIN_SCHEMA_VERSION,
        acceptedAt: new Date("2026-09-15T07:00:00.000Z"),
        revokedAt: null,
        policyVersion: DOMAIN_POLICY_VERSION,
      })
    })

    const order = await dataSource
      .getRepository(OrderEntity)
      .findOneByOrFail({ id: `order-${scope}` })
    const payment = await dataSource
      .getRepository(PaymentEntity)
      .findOneByOrFail({ id: `payment-${scope}` })
    const enrollment = await dataSource
      .getRepository(EnrollmentEntity)
      .findOneByOrFail({ id: `enrollment-${scope}` })
    const roster = await dataSource
      .getRepository(RosterEntryEntity)
      .findOneByOrFail({ id: `roster-${scope}` })
    const consent = await dataSource
      .getRepository(ConsentRecordEntity)
      .findOneByOrFail({ id: `consent-${scope}` })

    expect(order).toMatchObject({
      amountFen: 12_345,
      paidFen: 12_345,
      payerName: "Payer Person",
      requestIdempotencyKey: `request-${scope}`,
      status: ORDER_STATUS.paid,
    })
    expect(payment).toMatchObject({
      providerTransactionId: `provider-txn-${scope}`,
      providerEventId: `provider-event-${scope}`,
      status: PAYMENT_STATUS.succeeded,
    })
    expect(enrollment.contactName).toBe("Contact Person")
    expect(roster.displayName).toBe("Participant Person")
    expect(consent).toMatchObject({
      agreementVersion: "agreement-v1",
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      revokedAt: null,
    })
    expect(consent.acceptedAt.toISOString()).toBe("2026-09-15T07:00:00.000Z")
  })

  it("rolls back duplicated idempotency and provider identifiers", async () => {
    const scope = randomUUID()

    await expect(
      dataSource.transaction(async (manager) => {
        await savePendingOrder(manager, `${scope}-a`, `duplicate-request-${scope}`)
        await savePendingOrder(manager, `${scope}-b`, `duplicate-request-${scope}`)
      }),
    ).rejects.toThrow()

    await expect(
      dataSource.transaction(async (manager) => {
        await savePendingOrder(manager, `${scope}-c`, `provider-request-a-${scope}`)
        await savePendingOrder(manager, `${scope}-d`, `provider-request-b-${scope}`)
        await manager.save(PaymentEntity, {
          id: `rollback-payment-a-${scope}`,
          organizationId: `org-${scope}-c`,
          orderId: `order-${scope}-c`,
          paymentNo: `rollback-payment-a-${scope}`,
          providerTransactionId: `duplicate-provider-txn-${scope}`,
          providerEventId: `duplicate-provider-event-${scope}`,
          status: PAYMENT_STATUS.pending,
          amountFen: 100,
          channel: "manual_test",
          policyVersion: DOMAIN_POLICY_VERSION,
        })
        await manager.save(PaymentEntity, {
          id: `rollback-payment-b-${scope}`,
          organizationId: `org-${scope}-d`,
          orderId: `order-${scope}-d`,
          paymentNo: `rollback-payment-b-${scope}`,
          providerTransactionId: `duplicate-provider-txn-${scope}`,
          providerEventId: `duplicate-provider-event-${scope}`,
          status: PAYMENT_STATUS.pending,
          amountFen: 100,
          channel: "manual_test",
          policyVersion: DOMAIN_POLICY_VERSION,
        })
      }),
    ).rejects.toThrow()

    const orders = await dataSource
      .getRepository(OrderEntity)
      .countBy({ requestIdempotencyKey: `duplicate-request-${scope}` })
    const payments = await dataSource
      .getRepository(PaymentEntity)
      .countBy({ providerTransactionId: `duplicate-provider-txn-${scope}` })

    expect(orders).toBe(0)
    expect(payments).toBe(0)
  })
})
