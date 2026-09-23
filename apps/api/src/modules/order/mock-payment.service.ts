import {
  DOMAIN_POLICY_VERSION,
  ENROLLMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  ROSTER_STATUS,
} from "@linan/contracts"
import { ConflictException, Inject, Injectable } from "@nestjs/common"
import { createHash } from "node:crypto"
import type { EntityManager } from "typeorm"
import {
  EnrollmentEntity,
  OrderEntity,
  OrderLineEntity,
  PaymentEntity,
  PaymentEventEntity,
  RosterEntryEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import {
  amountMismatch,
  eventConflict,
  isDuplicateEntry,
  mockProviderUnavailable,
  orderNotPayable,
  paymentNotFound,
  providerMismatch,
  transactionConflict,
} from "./order.errors.js"
import {
  findScopedOrder,
  lockScopedOrder,
  mockPaymentNumber,
  toPaymentResponse,
} from "./order.persistence.js"
import {
  LOCAL_MOCK_PROVIDER,
  type MockPaymentEvent,
  type MockPaymentResponse,
} from "./order.types.js"
import { reduceMockPaymentStatus } from "./payment-state.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"

@Injectable()
export class MockPaymentService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  ensureAvailable(): void {
    if (process.env["NODE_ENV"] === "production") {
      throw mockProviderUnavailable()
    }
  }

  async start(identity: EnrollmentIdentity, orderId: string): Promise<MockPaymentResponse> {
    this.ensureAvailable()
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const { order } = await lockScopedOrder(manager, identity, orderId)
      if (order.status === ORDER_STATUS.cancelled || order.status === ORDER_STATUS.refunded) {
        throw orderNotPayable()
      }
      const paymentNo = mockPaymentNumber(order.id)
      const existing = await manager.findOneBy(PaymentEntity, {
        organizationId: order.organizationId,
        paymentNo,
      })
      if (existing !== null) {
        return toPaymentResponse(existing)
      }
      const payment = await manager.save(PaymentEntity, {
        id: makeId("payment"),
        organizationId: order.organizationId,
        orderId: order.id,
        paymentNo,
        status: PAYMENT_STATUS.pending,
        amountFen: order.amountFen,
        channel: LOCAL_MOCK_PROVIDER,
        policyVersion: DOMAIN_POLICY_VERSION,
      })
      return toPaymentResponse(payment)
    })
  }

  async process(identity: EnrollmentIdentity, event: MockPaymentEvent): Promise<MockPaymentResponse> {
    this.ensureAvailable()
    if (event.provider !== LOCAL_MOCK_PROVIDER) {
      throw providerMismatch()
    }
    const dataSource = await this.database.getDataSource()
    try {
      // Read committed makes the capacity count see payments committed while waiting for the session lock.
      return await dataSource.transaction("READ COMMITTED", async (manager) => {
        const { order, enrollment } = await lockScopedOrder(manager, identity, event.orderId)
        const payment = await manager.findOne(PaymentEntity, {
          where: { organizationId: order.organizationId, paymentNo: mockPaymentNumber(order.id) },
          lock: { mode: "pessimistic_write" },
        })
        if (payment === null || payment.orderId !== order.id || payment.channel !== LOCAL_MOCK_PROVIDER) {
          throw paymentNotFound()
        }
        if (event.amountFen !== order.amountFen || event.amountFen !== payment.amountFen) {
          throw amountMismatch()
        }

        const existingEvent = await manager.findOneBy(PaymentEventEntity, {
          provider: event.provider,
          providerEventId: event.eventId,
        })
        if (existingEvent !== null) {
          if (!eventMatches(existingEvent, payment.id, event)) {
            throw eventConflict()
          }
          return toPaymentResponse(payment)
        }
        await this.assertTransactionAvailable(manager, payment, event.transactionId)
        if (event.status === "succeeded" && order.status !== ORDER_STATUS.pendingPayment && order.status !== ORDER_STATUS.paid) {
          throw orderNotPayable()
        }

        await manager.save(PaymentEventEntity, {
          id: makeId("payment-event"),
          organizationId: payment.organizationId,
          paymentId: payment.id,
          provider: event.provider,
          providerEventId: event.eventId,
          providerTransactionId: event.transactionId,
          status: event.status,
          amountFen: event.amountFen,
          policyVersion: DOMAIN_POLICY_VERSION,
        })
        const nextStatus = reduceMockPaymentStatus(payment.status, event.status)
        payment.providerTransactionId = event.transactionId
        payment.providerEventId = event.eventId
        payment.status = nextStatus

        if (nextStatus === PAYMENT_STATUS.succeeded && order.status === ORDER_STATUS.pendingPayment) {
          await this.settleOrder(manager, order, enrollment)
          order.status = ORDER_STATUS.paid
          order.paidFen = order.amountFen
          enrollment.status = ENROLLMENT_STATUS.confirmed
          await manager.save(order)
          await manager.save(enrollment)
        }
        await manager.save(payment)
        return toPaymentResponse(payment)
      })
    } catch (error) {
      if (!isDuplicateEntry(error)) {
        throw error
      }
      return this.resolveDuplicateEvent(identity, event)
    }
  }

  private async assertTransactionAvailable(
    manager: EntityManager,
    payment: PaymentEntity,
    transactionId: string,
  ): Promise<void> {
    if (payment.providerTransactionId !== null && payment.providerTransactionId !== transactionId) {
      throw transactionConflict()
    }
    const existing = await manager.findOneBy(PaymentEntity, { providerTransactionId: transactionId })
    if (existing !== null && existing.id !== payment.id) {
      throw transactionConflict()
    }
  }

  private async settleOrder(
    manager: EntityManager,
    order: OrderEntity,
    enrollment: EnrollmentEntity,
  ): Promise<void> {
    const session = await manager.findOneOrFail(TourSessionEntity, {
      where: { id: enrollment.tourSessionId }, lock: { mode: "pessimistic_write" },
    })
    const lines = await manager.find(OrderLineEntity, { where: { orderId: order.id }, order: { id: "ASC" } })
    const occupiedCapacity = await manager.createQueryBuilder(RosterEntryEntity, "roster")
      .innerJoin(OrderEntity, "paid_order", "paid_order.enrollment_id = roster.enrollment_id and paid_order.status = :paid", { paid: ORDER_STATUS.paid })
      .where("roster.tour_session_id = :id", { id: session.id })
      .andWhere("roster.status != :cancelled", { cancelled: ROSTER_STATUS.cancelled })
      .getCount()
    if (occupiedCapacity + lines.length > session.capacity) {
      throw new ConflictException({ code: "tour_session_full", message: "tour session has insufficient remaining capacity" })
    }
    for (const line of lines) {
      await manager.save(RosterEntryEntity, {
        id: makeId("roster"),
        organizationId: order.organizationId,
        tourSessionId: enrollment.tourSessionId,
        enrollmentId: enrollment.id,
        enrollmentParticipantId: line.enrollmentParticipantId,
        displayName: line.displayNameSnapshot,
        credentialHash: createHash("sha256")
          .update(`${enrollment.tourSessionId}:${line.enrollmentParticipantId}`)
          .digest("hex"),
        status: ROSTER_STATUS.pending,
        policyVersion: DOMAIN_POLICY_VERSION,
      })
    }
  }

  private async resolveDuplicateEvent(
    identity: EnrollmentIdentity,
    event: MockPaymentEvent,
  ): Promise<MockPaymentResponse> {
    const manager = (await this.database.getDataSource()).manager
    const existingEvent = await manager.findOneBy(PaymentEventEntity, {
      provider: event.provider,
      providerEventId: event.eventId,
    })
    if (existingEvent !== null) {
      throw eventConflict()
    }
    const existingPayment = await manager.findOneBy(PaymentEntity, {
      providerTransactionId: event.transactionId,
    })
    if (existingPayment !== null) {
      throw transactionConflict()
    }
    await findScopedOrder(manager, identity, event.orderId)
    throw eventConflict()
  }
}

function eventMatches(eventRecord: PaymentEventEntity, paymentId: string, event: MockPaymentEvent): boolean {
  return eventRecord.paymentId === paymentId
    && eventRecord.provider === event.provider
    && eventRecord.providerEventId === event.eventId
    && eventRecord.providerTransactionId === event.transactionId
    && eventRecord.status === event.status
    && eventRecord.amountFen === event.amountFen
}
