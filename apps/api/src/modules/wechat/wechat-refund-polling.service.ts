import { Injectable, Logger } from "@nestjs/common"
import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common"
import { WechatTransactionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { readPaymentCapabilities } from "./wechat-config.js"
import { WechatPaymentService } from "./wechat-payment.service.js"

const MINUTE_MS = 60_000

@Injectable()
export class WechatRefundPollingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WechatRefundPollingService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly database: ConfigurationDatabaseService,
    private readonly payments: WechatPaymentService,
  ) {}

  onApplicationBootstrap(): void {
    if (!readPaymentCapabilities().wechatRefundEnabled) return
    this.timer = setInterval(() => {
      void this.pollOnce().catch(() => this.logger.error("微信退款状态轮询暂不可用"))
    }, MINUTE_MS)
    this.timer.unref()
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  async pollOnce(now = new Date()): Promise<number> {
    if (this.running || !readPaymentCapabilities().wechatRefundEnabled) return 0
    this.running = true
    try {
      const dataSource = await this.database.getDataSource()
      const candidates = await dataSource.manager.find(WechatTransactionEntity, {
        where: { kind: "refund", status: "processing" },
        order: { updatedAt: "ASC" },
        take: 100,
      })
      const due = candidates.filter(row => refundPollDue(row, now)).slice(0, 25)
      for (const transaction of due) {
        if (transaction.orderId === null || transaction.refundRequestId === null) continue
        try {
          await this.payments.syncWechatRefund(transaction.orderId, transaction.refundRequestId)
        } catch {
          this.logger.warn(`微信退款状态查询失败：${transaction.id}`)
        }
      }
      return due.length
    } finally {
      this.running = false
    }
  }
}

export function refundPollDue(transaction: Pick<WechatTransactionEntity, "createdAt" | "updatedAt">, now: Date): boolean {
  const ageMs = Math.max(0, now.getTime() - transaction.createdAt.getTime())
  const sinceLastPollMs = Math.max(0, now.getTime() - transaction.updatedAt.getTime())
  return sinceLastPollMs >= refundPollIntervalMs(ageMs)
}

export function refundPollIntervalMs(ageMs: number): number {
  if (ageMs <= 5 * MINUTE_MS) return MINUTE_MS
  if (ageMs <= 30 * MINUTE_MS) return 5 * MINUTE_MS
  if (ageMs <= 60 * MINUTE_MS) return 10 * MINUTE_MS
  if (ageMs <= 120 * MINUTE_MS) return 20 * MINUTE_MS
  return 30 * MINUTE_MS
}
