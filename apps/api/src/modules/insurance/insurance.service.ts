import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { InsuranceBatchEntity } from "../../domain/entities/insurance-batch.entity.js"
import { InsuranceBatchPersonEntity } from "../../domain/entities/insurance-batch-person.entity.js"
import { InsuranceHandoffEntity } from "../../domain/entities/insurance-handoff.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { decryptPersonValue } from "../enrollment/person-data.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { readTravelers } from "../travelers/travelers.read-model.js"
import { assertBatchSubmittable, assertInsurancePermission, assertSensitiveExportAllowed, buildInsuranceDraft, diffInsuranceBatch } from "./insurance.policy.js"
import type { InsuranceBatchPerson, InsuranceBatchSnapshot, InsuranceExportKind, InsuranceHandoff, InsuranceHandoffKind, InsurancePreview, InsuranceRosterDiff } from "./insurance.types.js"

export type CreateInsuranceBatchInput = { readonly tourSessionId: string; readonly expectedRosterVersion: string; readonly companyTemplateName: string | null }
export type SubmitInsuranceBatchInput = { readonly expectedRosterVersion: string; readonly receiptReference: string; readonly note: string }
export type InsuranceManualResultInput = { readonly success: boolean; readonly receiptReference: string | null; readonly policyNumber: string | null; readonly coverageStart: string | null; readonly coverageEnd: string | null; readonly note: string }
export type InsuranceChangeHandoffInput = { readonly kind: Extract<InsuranceHandoffKind, "policy_change" | "cancellation_change">; readonly note: string; readonly receiptReference: string | null }
export type InsuranceExportRow = { readonly name: string; readonly className: string; readonly identityNumber: string; readonly phone: string; readonly status: string; readonly policyNumber: string }

@Injectable()
export class InsuranceService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async latest(access: StaffAccess, tourSessionId: string): Promise<InsuranceBatchSnapshot | null> {
    assertInsurancePermission(access, "insurance.read")
    const manager = (await this.database.getDataSource()).manager
    await this.assertSessionScope(manager, access, tourSessionId)
    const batch = await manager.findOne(InsuranceBatchEntity, { where: { tourSessionId }, order: { createdAt: "DESC" } })
    return batch === null ? null : this.loadBatch(manager, batch.id)
  }

  async preview(access: StaffAccess, tourSessionId: string): Promise<InsurancePreview> {
    assertInsurancePermission(access, "insurance.read")
    const manager = (await this.database.getDataSource()).manager
    await this.assertSessionScope(manager, access, tourSessionId)
    const snapshot = await readTravelers(manager, tourSessionId)
    const people = buildInsuranceDraft({ id: "preview", actorId: access.actorId, snapshot, companyTemplateName: null }).people
    return {
      tourSessionId,
      organizationId: snapshot.organizationId,
      rosterVersion: snapshot.rosterVersion,
      activeCount: snapshot.activeCount,
      missingIdentityCount: people.filter((person) => person.issueCode === "missing_identity").length,
      conflictCount: snapshot.conflictCount,
    }
  }

  async createBatch(access: StaffAccess, input: CreateInsuranceBatchInput): Promise<InsuranceBatchSnapshot> {
    assertInsurancePermission(access, "insurance.write")
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      await this.assertSessionScope(manager, access, input.tourSessionId)
      const snapshot = await readTravelers(manager, input.tourSessionId)
      if (snapshot.rosterVersion !== input.expectedRosterVersion) throw staleRoster()
      const draft = buildInsuranceDraft({ id: makeId("insurance"), actorId: access.actorId, snapshot, companyTemplateName: input.companyTemplateName })
      await manager.save(InsuranceBatchEntity, {
        id: draft.id,
        organizationId: draft.organizationId,
        tourSessionId: draft.tourSessionId,
        rosterVersion: draft.rosterVersion,
        status: draft.status,
        companyTemplateName: draft.companyTemplateName,
        createdBy: access.actorId,
      })
      await manager.save(InsuranceBatchPersonEntity, draft.people.map((person) => toPersonEntity(draft.id, person)))
      await this.audit.record(manager, { organizationId: draft.organizationId, actorId: access.actorId, action: "insurance.batch.created", targetType: "insurance_batch", targetId: draft.id })
      return this.loadBatch(manager, draft.id)
    })
  }

  async diff(access: StaffAccess, batchId: string): Promise<InsuranceRosterDiff> {
    assertInsurancePermission(access, "insurance.read")
    const manager = (await this.database.getDataSource()).manager
    const batch = await this.loadBatch(manager, batchId)
    await this.assertSessionScope(manager, access, batch.tourSessionId)
    return diffInsuranceBatch(batch, await readTravelers(manager, batch.tourSessionId))
  }

  async submitBatch(access: StaffAccess, batchId: string, input: SubmitInsuranceBatchInput): Promise<InsuranceBatchSnapshot> {
    assertInsurancePermission(access, "insurance.write")
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const batch = await this.loadBatch(manager, batchId)
      await this.assertSessionScope(manager, access, batch.tourSessionId)
      const snapshot = await readTravelers(manager, batch.tourSessionId)
      assertBatchSubmittable(batch, input.expectedRosterVersion)
      if (snapshot.rosterVersion !== input.expectedRosterVersion) throw staleRoster()
      await manager.update(InsuranceBatchEntity, { id: batch.id }, { status: "submitted", submittedAt: new Date() })
      await manager.update(InsuranceBatchPersonEntity, { batchId: batch.id, status: "ready" }, { status: "submitted", receiptReference: input.receiptReference })
      await this.saveHandoff(manager, batch, access.actorId, "submitted", input.note, input.receiptReference)
      return this.loadBatch(manager, batch.id)
    })
  }

  async recordManualResult(access: StaffAccess, batchId: string, input: InsuranceManualResultInput): Promise<InsuranceBatchSnapshot> {
    assertInsurancePermission(access, "insurance.write")
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const batch = await this.loadBatch(manager, batchId)
      await this.assertSessionScope(manager, access, batch.tourSessionId)
      if (input.success && (input.receiptReference === null || input.policyNumber === null)) {
        throw new ConflictException({ code: "insurance_receipt_required", message: "人工投保成功必须填写回执依据和保单号" })
      }
      const status = input.success ? "insured" : "failed"
      await manager.update(InsuranceBatchEntity, { id: batch.id }, { status })
      await manager.update(InsuranceBatchPersonEntity, { batchId: batch.id }, {
        status,
        receiptReference: input.receiptReference,
        policyNumber: input.policyNumber,
        coverageStart: input.coverageStart,
        coverageEnd: input.coverageEnd,
      })
      await this.saveHandoff(manager, batch, access.actorId, input.success ? "manual_success" : "manual_failure", input.note, input.receiptReference)
      return this.loadBatch(manager, batch.id)
    })
  }

  async createChangeHandoff(access: StaffAccess, batchId: string, input: InsuranceChangeHandoffInput): Promise<InsuranceBatchSnapshot> {
    assertInsurancePermission(access, "insurance.write")
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const batch = await this.loadBatch(manager, batchId)
      await this.assertSessionScope(manager, access, batch.tourSessionId)
      const diff = diffInsuranceBatch(batch, await readTravelers(manager, batch.tourSessionId))
      if (!diff.rosterChanged) throw new ConflictException({ code: "insurance_roster_unchanged", message: "名单暂无待交接差异" })
      await manager.update(InsuranceBatchEntity, { id: batch.id }, { status: "change_pending" })
      await this.saveHandoff(manager, batch, access.actorId, input.kind, input.note, input.receiptReference)
      return this.loadBatch(manager, batch.id)
    })
  }

  async exportRows(access: StaffAccess, batchId: string, kind: InsuranceExportKind, sensitive: boolean): Promise<readonly InsuranceExportRow[]> {
    assertInsurancePermission(access, "insurance.export")
    const manager = (await this.database.getDataSource()).manager
    const batch = await this.loadBatch(manager, batchId)
    await this.assertSessionScope(manager, access, batch.tourSessionId)
    if (kind === "company_template" && batch.companyTemplateName === null) {
      throw new ConflictException({ code: "insurance_company_template_missing", message: "尚未配置保险公司正式模板，不能导出最终专用格式" })
    }
    if (sensitive) assertSensitiveExportAllowed(access)
    await this.audit.record(manager, { organizationId: batch.organizationId, actorId: access.actorId, action: sensitive ? "insurance.export.sensitive" : "insurance.export.masked", targetType: "insurance_batch", targetId: batch.id })
    return batch.people.map((person) => ({
      name: person.displayName,
      className: person.className ?? "",
      identityNumber: sensitive && person.identityCiphertext !== null ? decryptPersonValue(person.identityCiphertext, person.personDataKeyVersion) : person.identityMasked ?? "",
      phone: sensitive && person.phoneCiphertext !== null ? decryptPersonValue(person.phoneCiphertext, person.personDataKeyVersion) : person.phoneMasked ?? "",
      status: person.status,
      policyNumber: person.policyNumber ?? "",
    }))
  }

  private async assertSessionScope(manager: EntityManager, access: StaffAccess, tourSessionId: string): Promise<TourSessionEntity> {
    const session = await manager.findOneBy(TourSessionEntity, { id: tourSessionId })
    if (session === null) throw new NotFoundException({ code: "tour_session_not_found", message: "团期不存在" })
    if (access.scopes.some((scope) => scope.kind === "all" || (scope.kind === "tour_session" && scope.id === tourSessionId) || ((scope.kind === "school" || scope.kind === "organization") && scope.id === session.organizationId))) return session
    throw new ConflictException({ code: "insurance_scope_forbidden", message: "无权访问该团期保险名单" })
  }

  private async loadBatch(manager: EntityManager, batchId: string): Promise<InsuranceBatchSnapshot> {
    const batch = await manager.findOneBy(InsuranceBatchEntity, { id: batchId })
    if (batch === null) throw new NotFoundException({ code: "insurance_batch_not_found", message: "保险批次不存在" })
    const [people, handoffs] = await Promise.all([
      manager.find(InsuranceBatchPersonEntity, { where: { batchId }, order: { personRef: "ASC" } }),
      manager.find(InsuranceHandoffEntity, { where: { batchId }, order: { createdAt: "ASC" } }),
    ])
    return {
      id: batch.id,
      tourSessionId: batch.tourSessionId,
      organizationId: batch.organizationId,
      rosterVersion: batch.rosterVersion,
      status: batch.status,
      companyTemplateName: batch.companyTemplateName,
      submittedAt: batch.submittedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      people: people.map(fromPersonEntity),
      handoffs: handoffs.map(fromHandoffEntity),
    }
  }

  private async saveHandoff(manager: EntityManager, batch: InsuranceBatchSnapshot, actorId: string, kind: InsuranceHandoffKind, note: string, receiptReference: string | null): Promise<void> {
    await manager.save(InsuranceHandoffEntity, { id: makeId("ins_handoff"), batchId: batch.id, kind, rosterVersion: batch.rosterVersion, actorId, note, receiptReference })
    await this.audit.record(manager, { organizationId: batch.organizationId, actorId, action: `insurance.handoff.${kind}`, targetType: "insurance_batch", targetId: batch.id })
  }
}

function toPersonEntity(batchId: string, person: InsuranceBatchPerson): Partial<InsuranceBatchPersonEntity> {
  return { id: person.id, batchId, personRef: person.personRef, sourceRefsJson: [...person.sourceRefs], displayName: person.displayName, className: person.className, identityMasked: person.identityMasked, identityCiphertext: person.identityCiphertext, phoneMasked: person.phoneMasked, phoneCiphertext: person.phoneCiphertext, personDataKeyVersion: person.personDataKeyVersion, status: person.status, issueCode: person.issueCode }
}

function fromPersonEntity(person: InsuranceBatchPersonEntity): InsuranceBatchPerson {
  return { id: person.id, personRef: person.personRef, sourceRefs: person.sourceRefsJson, displayName: person.displayName, className: person.className, identityMasked: person.identityMasked, identityCiphertext: person.identityCiphertext, phoneMasked: person.phoneMasked, phoneCiphertext: person.phoneCiphertext, personDataKeyVersion: person.personDataKeyVersion, status: person.status, issueCode: person.issueCode, policyNumber: person.policyNumber, receiptReference: person.receiptReference, coverageStart: person.coverageStart, coverageEnd: person.coverageEnd }
}

function fromHandoffEntity(handoff: InsuranceHandoffEntity): InsuranceHandoff {
  return { id: handoff.id, kind: handoff.kind, note: handoff.note, receiptReference: handoff.receiptReference, createdAt: handoff.createdAt.toISOString() }
}

function staleRoster(): ConflictException {
  return new ConflictException({ code: "insurance_roster_version_stale", message: "名单版本已变化，请重新生成保险批次" })
}
