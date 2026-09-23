import { randomUUID } from "node:crypto"
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { ExecutionGuideAssignmentEntity } from "../../domain/entities/execution-guide-assignment.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { TransportSessionVehicleEntity } from "../../domain/entities/transport-session-vehicle.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { executionForbidden, hasSessionScope } from "./execution-access.policy.js"

export type GuideAssignmentInput = {
  readonly staffAccountId: string
  readonly tourSessionId: string
  readonly vehicleId?: string
  readonly reason: string
}

@Injectable()
export class ExecutionGuideAssignmentService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async assign(access: StaffAccess, input: GuideAssignmentInput): Promise<ExecutionGuideAssignmentEntity> {
    const source = await this.database.getDataSource()
    return source.transaction((manager) => this.assignIn(manager, access, input))
  }

  async revoke(access: StaffAccess, assignmentId: string, reason: string): Promise<ExecutionGuideAssignmentEntity> {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      this.assertManage(access)
      const assignment = await manager.findOneBy(ExecutionGuideAssignmentEntity, { id: assignmentId })
      if (assignment === null) throw new NotFoundException({ code: "execution_assignment_not_found", message: "导游分配不存在" })
      const session = await this.session(manager, access, assignment.tourSessionId)
      if (!hasSessionScope(access, session)) throw executionForbidden("无此团期的管理范围")
      assignment.active = false
      assignment.reason = reason.trim()
      assignment.updatedBy = access.actorId
      assignment.version += 1
      return manager.save(assignment)
    })
  }

  async list(access: StaffAccess, tourSessionId: string): Promise<readonly ExecutionGuideAssignmentEntity[]> {
    const manager = (await this.database.getDataSource()).manager
    this.assertManage(access)
    const session = await this.session(manager, access, tourSessionId)
    return manager.find(ExecutionGuideAssignmentEntity, { where: { tourSessionId: session.id }, order: { updatedAt: "DESC" } })
  }

  async assignIn(manager: EntityManager, access: StaffAccess, input: GuideAssignmentInput): Promise<ExecutionGuideAssignmentEntity> {
    this.assertManage(access)
    const session = await this.session(manager, access, input.tourSessionId)
    const guide = await manager.findOneBy(StaffAccountEntity, { id: input.staffAccountId })
    if (guide === null || guide.status !== "active" || (guide.expiresAt !== null && guide.expiresAt.getTime() <= Date.now())) {
      throw executionForbidden("必须分配真实有效的工作人员账号")
    }
    if (input.vehicleId !== undefined) {
      const vehicle = await manager.findOneBy(TransportSessionVehicleEntity, { id: input.vehicleId })
      if (vehicle === null || vehicle.tourSessionId !== session.id) {
        throw executionForbidden("车辆不属于该团期")
      }
    }
    const scopeKey = assignmentScopeKey(input.vehicleId)
    const previous = await manager.findOneBy(ExecutionGuideAssignmentEntity, { staffAccountId: guide.id, tourSessionId: session.id, scopeKey })
    const assignment = previous ?? manager.create(ExecutionGuideAssignmentEntity, { id: randomUUID() })
    assignment.staffAccountId = guide.id
    assignment.tourSessionId = session.id
    assignment.vehicleId = input.vehicleId ?? null
    assignment.scopeKey = scopeKey
    assignment.active = true
    assignment.reason = input.reason.trim()
    assignment.updatedBy = access.actorId
    assignment.version = previous === null ? 1 : previous.version + 1
    return manager.save(assignment)
  }

  private assertManage(access: StaffAccess): void {
    if (!access.permissionKeys.has("execution.manage")) {
      throw new ForbiddenException({ code: "execution_manage_forbidden", message: "无权维护导游分配" })
    }
  }

  private async session(manager: EntityManager, access: StaffAccess, tourSessionId: string): Promise<TourSessionEntity> {
    const session = await manager.findOneBy(TourSessionEntity, { id: tourSessionId })
    if (session === null) throw new NotFoundException({ code: "session_not_found", message: "团期不存在" })
    if (!hasSessionScope(access, session)) throw executionForbidden("无此团期的管理范围")
    return session
  }
}

export function assignmentScopeKey(vehicleId: string | undefined): string {
  return vehicleId ?? "session"
}
