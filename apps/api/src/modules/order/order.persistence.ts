import type { EntityManager } from "typeorm"
import {
  EnrollmentEntity,
  FamilyEntity,
  OrderEntity,
  OrderLineEntity,
  PaymentEntity,
} from "../../domain/entities/index.js"
import { enrollmentNotFound, orderNotFound } from "./order.errors.js"
import { LOCAL_MOCK_PROVIDER, type MockPaymentResponse, type OrderResponse } from "./order.types.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"

export type ScopedOrder = {
  readonly order: OrderEntity
  readonly enrollment: EnrollmentEntity
}

export async function lockScopedEnrollment(
  manager: EntityManager,
  identity: EnrollmentIdentity,
  enrollmentId: string,
): Promise<EnrollmentEntity> {
  const enrollment = await manager.findOne(EnrollmentEntity, {
    where: { id: enrollmentId },
    lock: { mode: "pessimistic_write" },
  })
  if (enrollment === null || !(await familyMatches(manager, identity, enrollment))) {
    throw enrollmentNotFound()
  }
  return enrollment
}

export async function findScopedOrder(
  manager: EntityManager,
  identity: EnrollmentIdentity,
  orderId: string,
): Promise<ScopedOrder> {
  const order = await manager.findOneBy(OrderEntity, { id: orderId })
  if (order === null) {
    throw orderNotFound()
  }
  return scopeOrder(manager, identity, order)
}

export async function lockScopedOrder(
  manager: EntityManager,
  identity: EnrollmentIdentity,
  orderId: string,
): Promise<ScopedOrder> {
  const order = await manager.findOne(OrderEntity, {
    where: { id: orderId },
    lock: { mode: "pessimistic_write" },
  })
  if (order === null) {
    throw orderNotFound()
  }
  return scopeOrder(manager, identity, order)
}

export async function toOrderResponse(manager: EntityManager, order: OrderEntity): Promise<OrderResponse> {
  const participantCount = await manager.countBy(OrderLineEntity, { orderId: order.id })
  return {
    id: order.id,
    code: order.code,
    enrollmentId: order.enrollmentId,
    payerName: order.payerName,
    status: order.status,
    amountFen: order.amountFen,
    paidFen: order.paidFen,
    participantCount,
  }
}

export function toPaymentResponse(payment: PaymentEntity): MockPaymentResponse {
  return {
    id: payment.id,
    orderId: payment.orderId,
    paymentNo: payment.paymentNo,
    provider: LOCAL_MOCK_PROVIDER,
    status: payment.status,
    amountFen: payment.amountFen,
  }
}

export function mockPaymentNumber(orderId: string): string {
  return `${LOCAL_MOCK_PROVIDER}:${orderId}`
}

async function scopeOrder(
  manager: EntityManager,
  identity: EnrollmentIdentity,
  order: OrderEntity,
): Promise<ScopedOrder> {
  const enrollment = await manager.findOneBy(EnrollmentEntity, { id: order.enrollmentId })
  if (enrollment === null || !(await familyMatches(manager, identity, enrollment))) {
    throw orderNotFound()
  }
  return { order, enrollment }
}

async function familyMatches(
  manager: EntityManager,
  identity: EnrollmentIdentity,
  enrollment: EnrollmentEntity,
): Promise<boolean> {
  if (enrollment.familyId === null) {
    return false
  }
  const family = await manager.findOneBy(FamilyEntity, {
    id: enrollment.familyId,
    organizationId: enrollment.organizationId,
    code: identity.familyCode,
  })
  return family !== null
}
