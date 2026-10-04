import { ENROLLMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@linan/contracts"
import { BadGatewayException, ConflictException, Inject, Injectable } from "@nestjs/common"
import { PaymentEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { WechatPayClient, WechatPayRequestError } from "../wechat/wechat-pay.client.js"
import { textValue } from "../wechat/wechat-parser.js"
import { lockScopedOrder, toOrderResponse } from "./order.persistence.js"
import type { OrderResponse } from "./order.types.js"

@Injectable()
export class OrderCancellationService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(WechatPayClient) private readonly client: WechatPayClient,
  ) {}

  async cancel(identity: EnrollmentIdentity, orderId: string): Promise<OrderResponse> {
    const dataSource = await this.database.getDataSource()
    return dataSource.transaction(async (manager) => {
      const { order, enrollment } = await lockScopedOrder(manager, identity, orderId)
      if (order.status === ORDER_STATUS.cancelled) return toOrderResponse(manager, order)
      if (order.status !== ORDER_STATUS.pendingPayment || order.paidFen !== 0) throw alreadyPaid()
      const payments = await manager.findBy(PaymentEntity, { orderId: order.id })
      if (payments.some(payment => payment.status === PAYMENT_STATUS.succeeded || payment.status === PAYMENT_STATUS.refunded)) throw alreadyPaid()
      for (const payment of payments) {
        if (payment.channel === "wechat_pay") await this.closeWechatPayment(payment.paymentNo)
      }
      order.status = ORDER_STATUS.cancelled
      enrollment.status = ENROLLMENT_STATUS.cancelled
      await manager.save(order)
      await manager.save(enrollment)
      return toOrderResponse(manager, order)
    })
  }

  private async closeWechatPayment(paymentNo: string): Promise<void> {
    const state = await this.wechatState(paymentNo)
    if (state === "CLOSED") return
    if (state === "SUCCESS" || state === "REFUND") throw alreadyPaid()
    if (state !== "NOTPAY") throw paymentUnconfirmed()
    const config = this.client.config()
    try {
      await this.client.request(`/v3/pay/transactions/out-trade-no/${encodeURIComponent(paymentNo)}/close`, { mchid: config.merchantId })
    } catch (error) {
      if (!(error instanceof BadGatewayException)) throw error
      const current = await this.wechatState(paymentNo)
      if (current === "CLOSED") return
      if (current === "SUCCESS" || current === "REFUND") throw alreadyPaid()
      throw paymentUnconfirmed()
    }
  }

  private async wechatState(paymentNo: string): Promise<string> {
    const config = this.client.config()
    try {
      const resource = await this.client.request(`/v3/pay/transactions/out-trade-no/${encodeURIComponent(paymentNo)}?mchid=${encodeURIComponent(config.merchantId)}`)
      if (textValue(resource, "appid") !== config.appId || textValue(resource, "mchid") !== config.merchantId || textValue(resource, "out_trade_no") !== paymentNo) {
        throw new BadGatewayException({ code: "wechat_payment_mismatch", message: "支付信息核对失败，请稍后刷新订单。" })
      }
      return textValue(resource, "trade_state")
    } catch (error) {
      if (error instanceof WechatPayRequestError && error.providerCode === "ORDER_NOT_EXIST") throw paymentUnconfirmed()
      throw error
    }
  }
}

function alreadyPaid(): ConflictException {
  return new ConflictException({ code: "order_not_cancellable", message: "订单已付款或已退款，不能取消支付。请刷新订单查看当前状态。" })
}

function paymentUnconfirmed(): ConflictException {
  return new ConflictException({ code: "payment_state_unconfirmed", message: "支付状态确认中，暂时无法取消。请稍后刷新订单再试。" })
}
