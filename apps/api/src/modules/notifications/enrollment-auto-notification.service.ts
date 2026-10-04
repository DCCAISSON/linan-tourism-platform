import { createHash } from "node:crypto"
import { Inject, Injectable, Logger } from "@nestjs/common"
import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import {
  CatalogItemEntity,
  EnrollmentEntity,
  FamilyEntity,
  TourSessionEntity,
  UserNotificationSubscriptionEntity as Subscription,
  UserNotificationTargetEntity as Target,
  UserNotificationTaskEntity as Task,
  UserNotificationTemplateEntity as Template,
  WechatIdentityEntity,
} from "../../domain/entities/index.js"
import type { UserTemplateField } from "../../domain/entities/user-notification.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { UserNotificationDispatchService } from "./user-notification-dispatch.service.js"
import { userTemplateData } from "./user-notifications.parser.js"
import { loadWechatSubscribeConfig } from "./wechat-subscribe.adapter.js"

const SYSTEM_ACTOR = "system:enrollment-confirmed"
const POLL_MS = 60_000

type EnrollmentTemplateFieldContract = {
  readonly key: string | null
  readonly label: string
  readonly rule: UserTemplateField["rule"]
  readonly value: "activityTitle" | "participantCount" | "startsAt"
}

const enrollmentFieldContracts = [
  [
    { key: null, label: "活动名称", rule: "thing", value: "activityTitle" },
    { key: null, label: "报名人数", rule: "number", value: "participantCount" },
    { key: null, label: "活动时间", rule: "time", value: "startsAt" },
  ],
  [
    { key: "thing5", label: "线路名", rule: "thing", value: "activityTitle" },
    { key: "number4", label: "人数", rule: "number", value: "participantCount" },
    { key: "time1", label: "预约时间", rule: "time", value: "startsAt" },
  ],
] as const satisfies readonly (readonly EnrollmentTemplateFieldContract[])[]

type EnrollmentPayloadInput = {
  readonly activityTitle: string
  readonly participantCount: number
  readonly startsAt: Date
}

type EnrollmentNotificationInput = {
  readonly enrollment: EnrollmentEntity
  readonly orderId: string
}

@Injectable()
export class EnrollmentAutoNotificationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EnrollmentAutoNotificationService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(UserNotificationDispatchService) private readonly dispatch: UserNotificationDispatchService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.dispatchAfterConfirmation()
    }, POLL_MS)
    this.timer.unref()
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  dispatchAfterConfirmation(): void {
    void this.dispatchPending().catch(() => this.logger.warn("报名成功订阅消息发送暂不可用"))
  }

  async enqueueConfirmed(manager: EntityManager, input: EnrollmentNotificationInput): Promise<number> {
    const { enrollment } = input
    if (enrollment.status !== "confirmed" || enrollment.familyId === null) return 0
    const [family, session] = await Promise.all([
      manager.findOneBy(FamilyEntity, { id: enrollment.familyId }),
      manager.findOneBy(TourSessionEntity, { id: enrollment.tourSessionId }),
    ])
    if (family === null || session === null) return 0
    const [identity, catalog, configuredTemplates] = await Promise.all([
      manager.findOneBy(WechatIdentityEntity, { familyCode: family.code }),
      manager.findOneBy(CatalogItemEntity, { id: session.catalogItemId }),
      manager.find(Template, { where: { category: "enrollment", enabled: true, type: "once" }, order: { createdAt: "ASC" } }),
    ])
    if (identity === null || catalog === null) return 0
    const templates = configuredTemplates.filter(template => isEnrollmentNotificationTemplate(template.fields))
    const template = templates[0]
    if (templates.length !== 1 || template === undefined) return 0
    const subscription = await manager.findOne(Subscription, {
      where: { actorId: identity.openidHash, templateId: template.id, status: "active" },
      lock: { mode: "pessimistic_write" },
    })
    if (subscription === null) return 0
    const idempotencyKey = enrollmentNotificationKey(input.orderId)
    const existing = await manager.findOneBy(Task, { idempotencyKey })
    if (existing !== null) return 0
    const payload = enrollmentTemplatePayload(template.fields, {
      activityTitle: catalog.title,
      participantCount: enrollment.participantCount,
      startsAt: session.startsAt,
    })
    const data = userTemplateData(template.fields, payload)
    const task = await manager.save(Task, {
      id: makeId("user-task"),
      templateId: template.id,
      idempotencyKey,
      requestFingerprint: createHash("sha256").update(JSON.stringify({ enrollmentId: enrollment.id, templateId: template.id, subscriptionId: subscription.id, data })).digest("hex"),
      createdBy: SYSTEM_ACTOR,
      payloadSnapshot: { templateId: template.templateId, title: template.title, page: `pages/orders/detail?orderId=${encodeURIComponent(input.orderId)}`, data },
    })
    await manager.save(Target, {
      id: makeId("user-target"),
      taskId: task.id,
      subscriptionId: subscription.id,
      subscriptionVersion: subscription.version,
      status: "pending",
    })
    return 1
  }

  async dispatchPending(): Promise<number> {
    if (this.running || loadWechatSubscribeConfig() === null) return 0
    this.running = true
    try {
      const manager = (await this.database.getDataSource()).manager
      const tasks = await manager.createQueryBuilder(Task, "task")
        .innerJoin(Target, "target", "target.task_id = task.id")
        .where("task.created_by = :createdBy", { createdBy: SYSTEM_ACTOR })
        .andWhere("target.status = :status", { status: "pending" })
        .orderBy("task.created_at", "ASC")
        .take(25)
        .getMany()
      for (const task of tasks) {
        await this.dispatch.sendAutomatic(task.id)
      }
      return tasks.length
    } finally {
      this.running = false
    }
  }
}

export function isEnrollmentNotificationTemplate(fields: readonly UserTemplateField[]): boolean {
  return enrollmentFieldContracts.some(contract => matchesEnrollmentFieldContract(fields, contract))
}

export function enrollmentTemplatePayload(fields: readonly UserTemplateField[], input: EnrollmentPayloadInput): Record<string, string> {
  const contract = enrollmentFieldContracts.find(candidate => matchesEnrollmentFieldContract(fields, candidate))
  if (contract === undefined) return {}
  const payload: Record<string, string> = {}
  for (const expected of contract) {
    const field = fields.find(candidate => matchesEnrollmentTemplateField(candidate, expected))
    if (field !== undefined) payload[field.key] = enrollmentPayloadValue(expected.value, input)
  }
  return payload
}

function matchesEnrollmentFieldContract(fields: readonly UserTemplateField[], contract: readonly EnrollmentTemplateFieldContract[]): boolean {
  return fields.length === contract.length && contract.every(expected => fields.some(field => matchesEnrollmentTemplateField(field, expected)))
}

function matchesEnrollmentTemplateField(field: UserTemplateField, expected: EnrollmentTemplateFieldContract): boolean {
  return (expected.key === null || field.key === expected.key) && field.label === expected.label && field.rule === expected.rule
}

function enrollmentPayloadValue(value: EnrollmentTemplateFieldContract["value"], input: EnrollmentPayloadInput): string {
  switch (value) {
    case "activityTitle": return [...input.activityTitle].slice(0, 20).join("")
    case "participantCount": return String(input.participantCount)
    case "startsAt": return chinaDateTime(input.startsAt)
  }
}

function enrollmentNotificationKey(orderId: string): string {
  return `enrollment-confirmed:${orderId}`
}

function chinaDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value)
  const part = (kind: Intl.DateTimeFormatPartTypes): string => parts.find(item => item.type === kind)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`
}
