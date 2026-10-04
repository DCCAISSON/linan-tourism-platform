import { ConflictException } from "@nestjs/common"
import { createHash } from "node:crypto"
import type { EntityManager } from "typeorm"
import { ContractTemplateVersionEntity, OrderContractEntity, OrderLineEntity } from "../../domain/entities/index.js"
import type { EnrollmentEntity, OrderEntity, TourSessionEntity } from "../../domain/entities/index.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { decryptPersonValue, encryptValue, PERSON_DATA_KEY_VERSION } from "../enrollment/person-data.js"
import { parseSignContract } from "./contracts.parser.js"
import type { ContractSnapshot, ContractTemplate, OrderContract } from "./contracts.types.js"

export function contractHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function toContractTemplate(entity: ContractTemplateVersionEntity): ContractTemplate {
  return { id: entity.id, tourSessionId: entity.tourSessionId, version: entity.version, title: entity.title, kind: entity.kind,
    bodyText: decryptPersonValue(entity.bodyCiphertext, entity.bodyKeyVersion), sourceFilename: entity.sourceFilename, sourceSha256: entity.sourceSha256,
    bodySha256: entity.bodySha256, createdBy: entity.createdBy, createdAt: entity.createdAt.toISOString() }
}

export async function captureOrderContract(manager: EntityManager, context: {
  readonly session: TourSessionEntity; readonly enrollment: EnrollmentEntity; readonly order: OrderEntity
}): Promise<void> {
  const { session, enrollment, order } = context
  if (session.activeContractTemplateId === null) return
  const template = await manager.findOneBy(ContractTemplateVersionEntity, { id: session.activeContractTemplateId, tourSessionId: session.id, organizationId: session.organizationId })
  if (template === null || enrollment.familyId === null) throw new ConflictException({ code: "contract_template_unavailable", message: "合同暂不可用，请联系工作人员" })
  const lines = await manager.find(OrderLineEntity, { where: { orderId: order.id }, order: { id: "ASC" } })
  const snapshot: ContractSnapshot = {
    signingScope: "individual_reading_confirmation",
    template: toContractTemplate(template),
    order: { id: order.id, code: order.code, payerName: order.payerName, amountFen: order.amountFen, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString() },
    participants: lines.map((line) => ({ name: line.displayNameSnapshot, kind: line.participantKindSnapshot, identityMasked: line.identityMaskedSnapshot, amountFen: line.amountFen })),
    scopeStatement: "本次记录为签字人本人的阅读确认。代未成年参加人确认时，签字人须具有相应监护资格或合法授权。其他成年参加人、单位及旅行社各自办理签署，监管填报另行处理。",
  }
  const snapshotText = JSON.stringify(snapshot)
  await manager.save(OrderContractEntity, { id: makeId("contract"), orderId: order.id, organizationId: order.organizationId,
    tourSessionId: session.id, enrollmentId: enrollment.id, familyId: enrollment.familyId,
    snapshotCiphertext: encryptValue(snapshotText), snapshotKeyVersion: PERSON_DATA_KEY_VERSION, snapshotHash: contractHash(snapshotText) })
}

export async function assertOrderContractSigned(manager: EntityManager, orderId: string): Promise<void> {
  const contract = await manager.findOneBy(OrderContractEntity, { orderId })
  if (contract !== null && contract.signedAt === null) {
    throw new ConflictException({ code: "contract_signature_required", message: "请先阅读旅游合同并手写签名" })
  }
}

export function toOrderContract(entity: OrderContractEntity): OrderContract {
  const snapshot: ContractSnapshot = JSON.parse(decryptPersonValue(entity.snapshotCiphertext, entity.snapshotKeyVersion))
  const signed = entity.signatureCiphertext !== null && entity.signatureKeyVersion !== null
    ? parseSignContract(JSON.parse(decryptPersonValue(entity.signatureCiphertext, entity.signatureKeyVersion))) : null
  return { ...snapshot, id: entity.id, orderId: entity.orderId, snapshotHash: entity.snapshotHash,
    status: entity.signedAt === null ? "pending_parent_signature" : "parent_signed_pending_agency",
    createdAt: entity.createdAt.toISOString(), signedAt: entity.signedAt?.toISOString() ?? null,
    signerName: signed?.signerName ?? null, phoneVerified: entity.phoneVerified, signature: signed?.signature ?? null, signatureHash: entity.signatureHash }
}
