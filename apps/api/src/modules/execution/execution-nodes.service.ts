import { randomUUID } from "node:crypto"
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { ExecutionPlanNodeEntity } from "../../domain/entities/execution-plan-node.entity.js"
import { ExecutionOccurrenceEntity } from "../../domain/entities/execution-occurrence.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { lockTransportPlan } from "../transport/transport-plan-store.js"
import { readTransportConfirmation } from "../transport/transport-confirmation.read.js"
import { assertTravelerActionable, readTravelers, resolveTraveler } from "../travelers/travelers.read-model.js"
import { ExecutionAccessService } from "./execution-access.service.js"
import { readConfirmedPerson } from "./execution-confirmed-person.js"
import type { parseExecutionNodeInput, parseOccurrenceInput } from "./execution-nodes.parser.js"

type NodeInput = ReturnType<typeof parseExecutionNodeInput>
type OccurrenceInput = ReturnType<typeof parseOccurrenceInput>

@Injectable()
export class ExecutionNodesService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(ExecutionAccessService) private readonly access: ExecutionAccessService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async list(access: StaffAccess, sessionId: string) {
    const manager = (await this.database.getDataSource()).manager
    await this.readAccess(manager, access, sessionId)
    const nodes = await manager.find(ExecutionPlanNodeEntity, { where: { tourSessionId: sessionId }, order: { reportDate: "ASC", scheduledTime: "ASC", createdAt: "ASC" } })
    const all = await manager.find(ExecutionOccurrenceEntity, { where: { tourSessionId: sessionId }, order: { createdAt: "ASC", version: "ASC" } })
    const confirmation = await readTransportConfirmation(manager, sessionId)
    const people = confirmation.status === "current" ? confirmation.snapshot.assignments : []
    const visiblePeople: { personRef: string; vehicleId: string }[] = []
    for (const person of people) {
      if (!access.permissionKeys.has("execution.manage")) {
        try { await this.access.assertAssignedIn(manager, access, { sessionId, vehicleId: person.vehicleId }) }
        catch (error) { if (error instanceof ForbiddenException) continue; throw error }
      }
      visiblePeople.push(person)
    }
    const records = access.permissionKeys.has("execution.manage") ? all : all.filter(row => visiblePeople.some(person => person.personRef === row.personRef))
    const actors = records.length === 0 ? [] : await manager.find(StaffAccountEntity, { where: { id: In([...new Set(records.map(row => row.recordedBy))]) }, select: { id: true, displayName: true } })
    const active = nodes.filter(node => node.active)
    const current = records.filter(row => !records.some(next => next.correctsId === row.id) && row.status !== "revoked")
    const progress = active.map(node => {
      const nodeRecords = current.filter(row => row.nodeId === node.id && row.nodeVersion === node.version)
      const missingPeople = visiblePeople.filter(person => !nodeRecords.some(row => row.personRef === person.personRef)).map(person => person.personRef)
      const absentPeople = visiblePeople.filter(person => nodeRecords.filter(row => row.personRef === person.personRef).at(-1)?.status === "absent").map(person => person.personRef)
      return { nodeId: node.id, expected: visiblePeople.length, completed: visiblePeople.length - missingPeople.length, missingPeople, absentPeople }
    })
    const completed = progress.reduce((sum, node) => sum + node.completed, 0)
    const expected = active.length * visiblePeople.length
    return { nodes, progress: confirmation.status === "current" ? progress : [], records: records.map(row => ({ ...row, recordedByName: actors.find(actor => actor.id === row.recordedBy)?.displayName ?? "工作人员", occurredAt: row.occurredAt.toISOString(), createdAt: row.createdAt.toISOString() })), counts: active.length === 0 || confirmation.status !== "current" ? null : { expected, completed, missing: expected - completed } }
  }

  async saveNode(access: StaffAccess, sessionId: string, input: NodeInput) {
    if (!access.permissionKeys.has("execution.manage")) throw new ForbiddenException("无权配置执行计划")
    return (await this.database.getDataSource()).transaction(async manager => {
      await lockTransportPlan(manager, sessionId)
      const session = await this.readAccess(manager, access, sessionId)
      await manager.findOneOrFail(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
      assertDate(session, input.reportDate)
      const previous = input.id === null ? null : await manager.findOneBy(ExecutionPlanNodeEntity, { id: input.id, tourSessionId: sessionId })
      if (input.id !== null && previous === null) throw new NotFoundException("计划节点不存在")
      if ((previous?.version ?? 0) !== input.expectedVersion) throw conflict()
      const node = manager.create(ExecutionPlanNodeEntity, { ...previous, ...input, id: previous?.id ?? `node-${randomUUID()}`, tourSessionId: sessionId, createdAt: previous?.createdAt ?? new Date(), updatedBy: access.actorId, version: input.expectedVersion + 1 })
      await manager.save(node)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: "execution.node.write", targetType: "execution_plan_node", targetId: node.id })
      return node
    })
  }

  async saveOccurrence(access: StaffAccess, sessionId: string, input: OccurrenceInput) {
    if (!access.permissionKeys.has("execution.write")) throw new ForbiddenException("无权填写执行记录")
    return (await this.database.getDataSource()).transaction(async manager => {
      await lockTransportPlan(manager, sessionId)
      const session = await this.readAccess(manager, access, sessionId)
      await manager.findOneOrFail(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
      const person = await readConfirmedPerson(manager, { sessionId, personRef: input.personRef })
      if (!(access.kind === "administrator" && access.permissionKeys.has("execution.manage"))) await this.access.assertAssignedIn(manager, access, { sessionId, vehicleId: person.vehicleId })
      assertTravelerActionable(resolveTraveler(await readTravelers(manager, sessionId), input.personRef))
      assertDate(session, input.reportDate)
      if (localDate(input.occurredAt) !== input.reportDate) throw new BadRequestException("发生时间须属于记录日期")
      const node = input.nodeId === null ? null : await manager.findOneBy(ExecutionPlanNodeEntity, { id: input.nodeId, tourSessionId: sessionId })
      const previous = input.correctsId === null ? null : await manager.findOneBy(ExecutionOccurrenceEntity, { id: input.correctsId, tourSessionId: sessionId, personRef: input.personRef })
      if (input.correctsId !== null && previous === null) throw new NotFoundException("原始记录不存在")
      if (previous !== null) {
        const latest = await manager.findOne(ExecutionOccurrenceEntity, { where: { rootId: previous.rootId }, order: { version: "DESC" } })
        if (latest?.id !== previous.id || previous.version !== input.expectedVersion) throw conflict()
        if (previous.nodeId !== input.nodeId || previous.reportDate !== input.reportDate || previous.type !== input.type) throw new BadRequestException("更正须保留原人员、日期和节点")
      } else if (input.nodeId !== null && (node === null || !node.active || node.reportDate !== input.reportDate || node.type !== input.type)) throw new BadRequestException("请选用该日期有效的计划节点")
      const id = `occ-${randomUUID()}`
      const record = manager.create(ExecutionOccurrenceEntity, { ...input, id, rootId: previous?.rootId ?? id, nodeVersion: previous?.nodeVersion ?? node?.version ?? null, tourSessionId: sessionId, vehicleId: person.vehicleId, createdAt: new Date(), recordedBy: access.actorId, version: input.expectedVersion + 1 })
      await manager.save(record)
      await this.audit.record(manager, { organizationId: session.organizationId, actorId: access.actorId, action: previous === null ? "execution.occurrence.record" : "execution.occurrence.correct", targetType: "execution_occurrence", targetId: id })
      return { ...record, occurredAt: record.occurredAt.toISOString(), createdAt: record.createdAt.toISOString() }
    })
  }

  private async readAccess(manager: EntityManager, access: StaffAccess, sessionId: string) {
    if (!access.permissionKeys.has("execution.read")) throw new ForbiddenException("无权查看执行记录")
    await this.access.requireActiveAccount(manager, access.actorId)
    const session = await this.access.session(manager, access, sessionId)
    if (!access.permissionKeys.has("execution.manage")) await this.access.assertAssignedIn(manager, access, { sessionId, vehicleId: undefined })
    return session
  }
}
function localDate(value: Date): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value) }
function assertDate(session: TourSessionEntity, date: string): void { if (date < localDate(session.startsAt) || date > localDate(session.endsAt)) throw new BadRequestException("记录日期须在团期内") }
function conflict(): ConflictException { return new ConflictException({ code: "execution_version_conflict", message: "记录已更新，请刷新后重试" }) }
