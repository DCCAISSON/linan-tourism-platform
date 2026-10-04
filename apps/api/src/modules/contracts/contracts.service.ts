import { ORDER_STATUS } from "@linan/contracts"
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { ContractTemplateVersionEntity, EnrollmentEntity, OrderContractEntity, OrderEntity, TourSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { encryptValue, PERSON_DATA_KEY_VERSION } from "../enrollment/person-data.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { isDuplicateEntry } from "../order/order.errors.js"
import { findScopedOrder, lockScopedOrder } from "../order/order.persistence.js"
import { CONTRACT_SOURCES } from "./contract-sources.js"
import { contractInputInvalid } from "./contracts.parser.js"
import { contractHash, toContractTemplate, toOrderContract } from "./contracts.persistence.js"
import { assertContractPermission, assertContractSessionScope } from "./contracts.scope.js"
import type { ContractResponse, ContractSessionResponse, ContractTemplate, NewContractTemplate, SignContractInput } from "./contracts.types.js"

@Injectable()
export class ContractsService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async session(access: StaffAccess, sessionId: string): Promise<ContractSessionResponse> {
    assertContractPermission(access, "configuration.read")
    const manager = (await this.database.getDataSource()).manager
    const session = await manager.findOneBy(TourSessionEntity, { id: sessionId })
    if (session === null) throw missing()
    assertContractSessionScope(access, session)
    const versions = await manager.find(ContractTemplateVersionEntity, { where: { tourSessionId: session.id, organizationId: session.organizationId }, order: { createdAt: "DESC", id: "DESC" } })
    return { activeTemplateId: session.activeContractTemplateId, versions: versions.map(toContractTemplate) }
  }

  async createVersion(access: StaffAccess, sessionId: string, input: NewContractTemplate): Promise<ContractTemplate> {
    assertContractPermission(access, "configuration.write")
    const source = CONTRACT_SOURCES.find((candidate) => candidate.id === input.sourceId)
    if (source === undefined) throw contractInputInvalid()
    const dataSource = await this.database.getDataSource()
    try {
      return await dataSource.transaction(async (manager) => {
        const session = await manager.findOne(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
        if (session === null) throw missing()
        assertContractSessionScope(access, session)
        const template = await manager.save(ContractTemplateVersionEntity, { id: makeId("contract-template"), organizationId: session.organizationId,
          tourSessionId: session.id, version: input.version, title: input.title, kind: source.kind,
          bodyCiphertext: encryptValue(input.bodyText), bodyKeyVersion: PERSON_DATA_KEY_VERSION,
          sourceFilename: source.sourceFilename, sourceSha256: source.sourceSha256, bodySha256: contractHash(input.bodyText), createdBy: access.actorId })
        await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "contract_template.created", targetType: "contract_template", targetId: template.id })
        return toContractTemplate(template)
      })
    } catch (error) {
      if (isDuplicateEntry(error)) throw new ConflictException({ code: "contract_version_conflict", message: "此版本号已存在，请使用新版本号" })
      throw error
    }
  }

  async activate(access: StaffAccess, sessionId: string, templateId: string | null): Promise<ContractSessionResponse> {
    assertContractPermission(access, "configuration.write")
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const session = await manager.findOne(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
      if (session === null) throw missing()
      assertContractSessionScope(access, session)
      if (templateId !== null && !(await manager.existsBy(ContractTemplateVersionEntity, { id: templateId, tourSessionId: session.id, organizationId: session.organizationId }))) throw missing()
      session.activeContractTemplateId = templateId
      await manager.save(session)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: templateId === null ? "contract_template.disabled" : "contract_template.activated", targetType: "tour_session", targetId: session.id })
      const versions = await manager.find(ContractTemplateVersionEntity, { where: { tourSessionId: session.id, organizationId: session.organizationId }, order: { createdAt: "DESC", id: "DESC" } })
      return { activeTemplateId: templateId, versions: versions.map(toContractTemplate) }
    })
  }

  async familyContract(identity: EnrollmentIdentity, orderId: string): Promise<ContractResponse> {
    const manager = (await this.database.getDataSource()).manager
    await findScopedOrder(manager, identity, orderId)
    const contract = await manager.findOneBy(OrderContractEntity, { orderId })
    return { contract: contract === null ? null : toOrderContract(contract) }
  }

  async sign(identity: EnrollmentIdentity, orderId: string, input: SignContractInput): Promise<ContractResponse> {
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const { order } = await lockScopedOrder(manager, identity, orderId)
      if (!identity.phoneVerified) throw new ForbiddenException({ code: "contract_phone_required", message: "请先验证本人的手机号" })
      const contract = await manager.findOne(OrderContractEntity, { where: { orderId }, lock: { mode: "pessimistic_write" } })
      if (contract === null) throw missing()
      if (input.snapshotHash !== contract.snapshotHash) throw new ConflictException({ code: "contract_snapshot_changed", message: "合同内容已更新，请重新阅读后签名" })
      const signatureText = JSON.stringify(input.signature)
      const signatureHash = contractHash(signatureText)
      if (contract.signedAt !== null) {
        const current = toOrderContract(contract)
        if (contract.signatureHash !== signatureHash || current.signerName !== input.signerName || contract.signerActorId !== identity.actorId) {
          throw new ConflictException({ code: "contract_already_signed", message: "本合同已签名，不能覆盖原签名" })
        }
        return { contract: current }
      }
      if (order.status !== ORDER_STATUS.pendingPayment) throw new ConflictException({ code: "contract_order_not_signable", message: "当前订单不能继续签名" })
      contract.signedAt = new Date()
      contract.signerActorId = identity.actorId
      contract.phoneVerified = true
      contract.signatureCiphertext = encryptValue(JSON.stringify(input))
      contract.signatureKeyVersion = PERSON_DATA_KEY_VERSION
      contract.signatureHash = signatureHash
      await manager.save(contract)
      await this.audit.record(manager, { organizationId: contract.organizationId, actorId: identity.actorId, action: "order_contract.parent_signed", targetType: "order_contract", targetId: contract.id })
      return { contract: toOrderContract(contract) }
    })
  }

  async staffContract(access: StaffAccess, orderId: string): Promise<ContractResponse> {
    assertContractPermission(access, "orders.read")
    assertContractPermission(access, "sensitive_data.read")
    const manager = (await this.database.getDataSource()).manager
    const order = await manager.findOneBy(OrderEntity, { id: orderId })
    if (order === null) throw missing()
    const enrollment = await manager.findOneBy(EnrollmentEntity, { id: order.enrollmentId })
    if (enrollment === null) throw missing()
    const session = await manager.findOneBy(TourSessionEntity, { id: enrollment.tourSessionId })
    if (session === null) throw missing()
    assertContractSessionScope(access, session)
    const contract = await manager.findOneBy(OrderContractEntity, { orderId })
    await this.audit.record(manager, { organizationId: order.organizationId, actorId: access.actorId, action: "order_contract.sensitive_read", targetType: "order", targetId: order.id })
    return { contract: contract === null ? null : toOrderContract(contract) }
  }
}

function missing(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "合同或团期不存在" })
}
