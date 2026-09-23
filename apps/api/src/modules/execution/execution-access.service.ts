import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In } from "typeorm"
import type { EntityManager } from "typeorm"
import { ExecutionGuideAssignmentEntity } from "../../domain/entities/execution-guide-assignment.entity.js"
import { StaffAccountEntity } from "../../domain/entities/staff-account.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertAssignmentAccess, executionForbidden, hasSessionScope } from "./execution-access.policy.js"

@Injectable()
export class ExecutionAccessService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async assertAssigned(access: StaffAccess, sessionId: string, vehicleId?: string): Promise<void> {
    const db = await this.database.getDataSource()
    await this.assertAssignedIn(db.manager, access, { sessionId, vehicleId })
  }

  async assertAssignedIn(manager: EntityManager, access: StaffAccess, target: { readonly sessionId: string; readonly vehicleId: string | undefined }): Promise<void> {
    await this.requireActiveAccount(manager, access.actorId)
    const session = await this.session(manager, access, target.sessionId)
    const rows = await manager.findBy(ExecutionGuideAssignmentEntity, { staffAccountId: access.actorId, tourSessionId: session.id, active: true })
    assertAssignmentAccess(rows, session.id, target.vehicleId)
  }

  async assignedSessionIds(access: StaffAccess): Promise<readonly string[]> {
    const db = await this.database.getDataSource()
    await this.requireActiveAccount(db.manager, access.actorId)
    const rows = await db.manager.findBy(ExecutionGuideAssignmentEntity, { staffAccountId: access.actorId, active: true })
    if (rows.length === 0) return []
    const sessions = await db.manager.findBy(TourSessionEntity, { id: In(rows.map((row) => row.tourSessionId)) })
    return sessions.filter((session) => hasSessionScope(access, session)).map((session) => session.id)
  }

  async session(manager: EntityManager, access: StaffAccess, sessionId: string): Promise<TourSessionEntity> {
    const session = await manager.findOneBy(TourSessionEntity, { id: sessionId })
    if (session === null) throw new NotFoundException({ code: "session_not_found", message: "团期不存在" })
    if (!hasSessionScope(access, session)) throw executionForbidden("无此团期的访问范围")
    return session
  }

  async requireActiveAccount(manager: EntityManager, accountId: string): Promise<StaffAccountEntity> {
    const account = await manager.findOneBy(StaffAccountEntity, { id: accountId })
    if (account === null || account.status !== "active" || (account.expiresAt !== null && account.expiresAt.getTime() <= Date.now())) {
      throw executionForbidden("必须使用有效的真实工作人员账号")
    }
    return account
  }
}
