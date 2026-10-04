import { BadRequestException, ConflictException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { OrderLineEntity, OrganizationEntity, RefundRequestEntity, RefundRequestLineEntity } from "../../domain/entities/index.js"
import { RefundApplicationEntity } from "../../domain/entities/refund-application.entity.js"
import { ensureSchoolPlacement } from "../enrollment/enrollment.persistence.js"
import type { NewFamilyMember } from "../enrollment/enrollment.types.js"
import { protectPersonData } from "../enrollment/person-data.js"
import type { ScopedOrder } from "../order/order.persistence.js"
import type { OrderChangeRequestEntity } from "../../domain/entities/order-change-request.entity.js"
import type { ChangeParticipant, OrderChangeKind, OrderChangeResponse, OriginalOrderSnapshot } from "./order-change.types.js"

export async function prepareChangeParticipant(manager: EntityManager, schoolId: string, input: NewFamilyMember): Promise<ChangeParticipant> {
  const school = await manager.findOneByOrFail(OrganizationEntity, { id: schoolId })
  let gradeId: string | null = null
  let gradeName: string | null = null
  let classId: string | null = null
  let className: string | null = null
  if (input.participantKind === "student") {
    if (input.schoolId !== schoolId || input.gradeId === undefined || input.classId === undefined) {
      throw new BadRequestException({ code: "malformed_input", message: "请选择本订单学校的年级和班级" })
    }
    const placement = await ensureSchoolPlacement(manager, { schoolId, gradeId: input.gradeId, classId: input.classId })
    gradeId = placement.grade.id
    gradeName = placement.grade.name
    classId = placement.schoolClass.id
    className = placement.schoolClass.name
  }
  if (input.personData === undefined) throw new BadRequestException({ code: "malformed_input", message: "请填写拟参加人的证件号码和手机号" })
  return { displayName: input.displayName, participantKind: input.participantKind, schoolId, schoolName: school.name, gradeId, gradeName, classId, className, personData: protectPersonData(input.personData) }
}

export async function readOriginalOrderSnapshot(manager: EntityManager, scoped: ScopedOrder): Promise<OriginalOrderSnapshot> {
  const lines = await manager.find(OrderLineEntity, { where: { orderId: scoped.order.id }, order: { id: "ASC" } })
  return {
    orderCode: scoped.order.code, amountFen: scoped.order.amountFen, paidFen: scoped.order.paidFen, tourSessionId: scoped.enrollment.tourSessionId,
    lines: lines.map((line) => ({
      id: line.id, displayName: line.displayNameSnapshot, participantKind: line.participantKindSnapshot,
      gradeName: line.gradeNameSnapshot, className: line.classNameSnapshot, amountFen: line.amountFen,
      identityCiphertext: line.identityCiphertextSnapshot, identityNumberMasked: line.identityMaskedSnapshot,
      phoneCiphertext: line.phoneCiphertextSnapshot, phoneMasked: line.phoneMaskedSnapshot, personDataKeyVersion: line.personDataKeyVersionSnapshot,
    })),
  }
}

export async function activeRefundLineIds(manager: EntityManager, orderId: string): Promise<readonly string[]> {
  const [applications, requests] = await Promise.all([
    manager.find(RefundApplicationEntity, { where: { orderId, status: In(["submitted", "approved"]) } }),
    manager.find(RefundRequestEntity, { where: { orderId, status: "pending" } }),
  ])
  const pendingLines = requests.length === 0 ? [] : await manager.find(RefundRequestLineEntity, { where: { refundRequestId: In(requests.map((row) => row.id)) } })
  return [...new Set([
    ...applications.filter((row) => row.refundRequestId === null).flatMap((row) => row.lines.map((line) => line.lineId)),
    ...pendingLines.map((line) => line.orderLineId),
  ])]
}

export function hasRefundConflict(kind: OrderChangeKind, originalLineId: string | null, activeLines: readonly string[]): boolean {
  return kind === "addition" ? activeLines.length > 0 : originalLineId !== null && activeLines.includes(originalLineId)
}

export function assertNoChangeRefundConflict(kind: OrderChangeKind, originalLineId: string | null, activeLines: readonly string[]): void {
  if (hasRefundConflict(kind, originalLineId, activeLines)) {
    throw new ConflictException({ code: "order_change_refund_conflict", message: kind === "addition" ? "本订单有退款正在处理，请待退款处理结束后再申请增补人员" : "所选人员有退款正在处理，请待退款处理结束后再申请换人" })
  }
}

export function toOrderChangeResponse(row: OrderChangeRequestEntity, refundLines: readonly string[]): OrderChangeResponse {
  const participant = row.proposedParticipant
  return {
    id: row.id, orderId: row.orderId, orderCode: row.originalSnapshot.orderCode, kind: row.kind, originalLineId: row.originalLineId,
    reason: row.reason, status: row.status, version: row.version, refundConflict: hasRefundConflict(row.kind, row.originalLineId, refundLines),
    originalSnapshot: {
      orderCode: row.originalSnapshot.orderCode, amountFen: row.originalSnapshot.amountFen, paidFen: row.originalSnapshot.paidFen, tourSessionId: row.originalSnapshot.tourSessionId,
      lines: row.originalSnapshot.lines.map((line) => ({ id: line.id, displayName: line.displayName, participantKind: line.participantKind, gradeName: line.gradeName, className: line.className, amountFen: line.amountFen, identityNumberMasked: line.identityNumberMasked, phoneMasked: line.phoneMasked })),
    },
    proposedParticipant: {
      displayName: participant.displayName, participantKind: participant.participantKind, schoolId: participant.schoolId, schoolName: participant.schoolName,
      gradeId: participant.gradeId, gradeName: participant.gradeName, classId: participant.classId, className: participant.className,
      identityNumberMasked: participant.personData.identityMasked, phoneMasked: participant.personData.phoneMasked,
    },
    history: row.history.map((entry) => ({ version: entry.version, status: entry.status, action: entry.action, actorName: entry.actorName, note: entry.note, at: entry.at })),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}
