import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { Injectable } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { AuditLogEntity } from "../../domain/entities/index.js"
import { makeId } from "../configuration/configuration.persistence.js"

export type AuditEvent = {
  readonly organizationId: string
  readonly actorId: string
  readonly action: string
  readonly targetType: string
  readonly targetId: string
}

@Injectable()
export class AuditLogService {
  async record(manager: EntityManager, event: AuditEvent): Promise<void> {
    await manager.save(AuditLogEntity, {
      id: makeId("audit"),
      ...event,
      policyVersion: DOMAIN_POLICY_VERSION,
    })
  }
}
