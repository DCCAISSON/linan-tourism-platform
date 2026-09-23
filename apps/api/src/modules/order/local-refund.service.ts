import { ORDER_STATUS, PAYMENT_STATUS } from "@linan/contracts"
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { OrderEntity, OrderLineEntity, PaymentEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { findScopedOrder } from "./order.persistence.js"
import { calculateParticipantRefund, RefundCalculationError } from "./refund-calculation.js"
import { buildOrderRefundView } from "./refund-read-model.js"
import type { LocalRefundSelection } from "./local-refund.parser.js"

export type LocalRefundPreview = {
  readonly mode: "local_validation"
  readonly settlementPerformed: false
  readonly orderId: string
  readonly participantCount: number
  readonly amountFen: number
  readonly lines: readonly { readonly lineId: string; readonly displayName: string; readonly amountFen: number }[]
}

@Injectable()
export class LocalRefundService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  ensureAvailable(): void {
    if (process.env["NODE_ENV"] === "production") {
      throw new NotFoundException({ code: "local_refund_unavailable", message: "local refund validation is unavailable" })
    }
  }

  async preview(identity: EnrollmentIdentity, orderId: string, selection: LocalRefundSelection): Promise<LocalRefundPreview> {
    this.ensureAvailable()
    const manager = (await this.database.getDataSource()).manager
    const { order } = await findScopedOrder(manager, identity, orderId)
    return this.calculate(order, selection)
  }

  async previewStaff(orderId: string, selection: LocalRefundSelection): Promise<LocalRefundPreview> {
    this.ensureAvailable()
    const manager = (await this.database.getDataSource()).manager
    const order = await manager.findOneBy(OrderEntity, { id: orderId })
    if (order === null) throw new NotFoundException({ code: "not_found", message: "order was not found" })
    return this.calculate(order, selection)
  }

  private async calculate(order: OrderEntity, selection: LocalRefundSelection): Promise<LocalRefundPreview> {
    const orderId = order.id
    const manager = (await this.database.getDataSource()).manager
    const [lines, payments] = await Promise.all([
      manager.find(OrderLineEntity, { where: { orderId }, order: { id: "ASC" } }),
      manager.find(PaymentEntity, { where: { orderId, status: PAYMENT_STATUS.succeeded } }),
    ])
    if (order.status !== ORDER_STATUS.paid || order.paidFen !== order.amountFen || order.paidFen <= 0
      || lines.length === 0 || lines.reduce((total, line) => total + line.amountFen, 0) !== order.paidFen
      || payments.length !== 1 || payments[0]?.amountFen !== order.paidFen) {
      throw new ConflictException({ code: "refund_payment_unverified", message: "individual paid fees cannot be verified for this order" })
    }
    const refundView = await buildOrderRefundView(manager, orderId, order.amountFen)
    try {
      const quote = calculateParticipantRefund(lines.map((line) => ({
        lineId: line.id, paidFen: line.amountFen,
        refundedFen: refundView.participants.get(line.id)?.refundedFen ?? 0,
        reservedFen: refundView.participants.get(line.id)?.pendingFen ?? 0,
      })), selection.lineIds)
      return {
        mode: "local_validation", settlementPerformed: false, orderId, amountFen: quote.amountFen,
        participantCount: quote.lines.length,
        lines: lines.filter((line) => selection.lineIds.includes(line.id)).map((line) => ({
          lineId: line.id, displayName: line.displayNameSnapshot,
          amountFen: quote.lines.find((quotedLine) => quotedLine.lineId === line.id)?.amountFen ?? 0,
        })),
      }
    } catch (error) {
      if (error instanceof RefundCalculationError) {
        throw new BadRequestException({ code: error.code, message: error.message })
      }
      throw error
    }
  }
}
