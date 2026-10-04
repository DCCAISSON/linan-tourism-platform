import { BadGatewayException, BadRequestException, Inject, Injectable } from "@nestjs/common"
import { createHash } from "node:crypto"
import { PaymentEntity, WechatBillDifferenceEntity, WechatBillReconciliationEntity, WechatTransactionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import { WechatPayClient } from "./wechat-pay.client.js"
import { loadWechatPayConfig } from "./wechat-config.js"
import { billDate, fenValue, record, textValue } from "./wechat-parser.js"
import { parseTradeBill, type BillRow } from "./wechat-bill.parser.js"

export type BillDifference = {
  readonly kind: "wechat_only" | "local_only" | "amount_mismatch" | "refund_mismatch" | "matched"
  readonly outTradeNo: string
  readonly outRefundNo: string | null
  readonly wechatAmountFen: number | null
  readonly localAmountFen: number | null
  readonly wechatRefundFen: number | null
  readonly localRefundFen: number | null
  readonly summary: string
}

export type PaymentReconciliationResponse = {
  readonly billDate: string
  readonly contentHash: string
  readonly differenceCount: number
  readonly confirmedNote: string | null
  readonly differences: readonly BillDifference[]
}

type BillDifferenceInput = {
  readonly kind: BillDifference["kind"]
  readonly outTradeNo: string
  readonly outRefundNo: string | null
  readonly wechatAmountFen: number | null
  readonly localAmountFen: number | null
  readonly wechatRefundFen: number | null
  readonly localRefundFen: number | null
  readonly summary: string
}

type BillReconciliationInput = {
  readonly merchant: { readonly appId: string; readonly merchantId: string }
  readonly rows: readonly BillRow[]
  readonly payments: readonly { readonly paymentNo: string; readonly amountFen: number }[]
  readonly refunds?: readonly { readonly outRefundNo: string | null; readonly outTradeNo: string | null; readonly amountFen: number }[]
}

@Injectable()
export class WechatReconciliationService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(WechatPayClient) private readonly client: WechatPayClient,
  ) {}

  async reconcile(dateValue: unknown): Promise<PaymentReconciliationResponse> {
    const date = billDate(dateValue)
    const config = loadWechatPayConfig()
    const bill = await this.client.downloadBill(date)
    const content = bill.content.toString("utf8")
    const contentHash = createHash("sha256").update(bill.content).digest("hex")
    const rows = parseTradeBill(content)
    const dataSource = await this.database.getDataSource()
    const localPayments = await dataSource.manager.findBy(PaymentEntity, { channel: "wechat_pay" })
    const localRefunds = await dataSource.manager.findBy(WechatTransactionEntity, { kind: "refund" })
    const paymentNumbersByOrder = new Map(localPayments.map((payment) => [payment.orderId, payment.paymentNo]))
    const payments: PaymentEntity[] = []
    for (const payment of localPayments) {
      if (payment.status !== "succeeded" && payment.status !== "refunded") continue
      const resource = await this.client.request(`/v3/pay/transactions/out-trade-no/${encodeURIComponent(payment.paymentNo)}?mchid=${encodeURIComponent(config.merchantId)}`)
      if (providerBillDate(resource["success_time"]) === date) payments.push(payment)
    }
    const refunds: WechatTransactionEntity[] = []
    for (const refund of localRefunds) {
      if (refund.outRefundNo === null) throw new BadGatewayException({ code: "wechat_bill_date_unverified", message: "退款单号缺失，无法核实账单日期" })
      const resource = await this.client.request(`/v3/refund/domestic/refunds/${encodeURIComponent(refund.outRefundNo)}`)
      if (providerBillDate(resource["create_time"]) === date) refunds.push(refund)
    }
    const differences = buildBillDifferences({
      merchant: { appId: config.appId, merchantId: config.merchantId },
      rows,
      payments,
      refunds: refunds.map((refund) => ({
        outRefundNo: refund.outRefundNo,
        outTradeNo: refund.orderId === null ? null : paymentNumbersByOrder.get(refund.orderId) ?? null,
        amountFen: refund.amountFen,
      })),
    })
    return dataSource.transaction(async (manager) => {
      let record = await manager.findOneBy(WechatBillReconciliationEntity, { billDate: date })
      if (record === null) {
        record = await manager.save(WechatBillReconciliationEntity, {
          id: makeId("wechat-bill"), billDate: date, contentHash,
          differenceCount: differences.filter((difference) => difference.kind !== "matched").length,
          confirmedNote: null,
        })
      } else {
        record.contentHash = contentHash
        record.differenceCount = differences.filter((difference) => difference.kind !== "matched").length
        await manager.save(record)
        await manager.delete(WechatBillDifferenceEntity, { reconciliationId: record.id })
      }
      await manager.save(WechatBillDifferenceEntity, differences.filter((difference) => difference.kind !== "matched").map((difference) => ({
        id: makeId("wechat-diff"), reconciliationId: record.id, kind: difference.kind,
        outTradeNo: difference.outTradeNo, outRefundNo: difference.outRefundNo, wechatAmountFen: difference.wechatAmountFen,
        localAmountFen: difference.localAmountFen, wechatRefundFen: difference.wechatRefundFen, localRefundFen: difference.localRefundFen, summary: difference.summary,
      })))
      return { billDate: date, contentHash, differenceCount: record.differenceCount, confirmedNote: record.confirmedNote, differences }
    })
  }

  async verifyNoTransactionsOn(dateValue: unknown): Promise<boolean> {
    const date = billDate(dateValue)
    const config = loadWechatPayConfig()
    const manager = (await this.database.getDataSource()).manager
    const payments = await manager.findBy(PaymentEntity, { channel: "wechat_pay" })
    const refunds = await manager.findBy(WechatTransactionEntity, { kind: "refund" })
    const unverified = new BadGatewayException({ code: "wechat_bill_date_unverified", message: "微信交易信息无法核实，不能认定当日无交易" })
    for (const payment of payments) {
      const resource = await this.client.request(`/v3/pay/transactions/out-trade-no/${encodeURIComponent(payment.paymentNo)}?mchid=${encodeURIComponent(config.merchantId)}`)
      if (textValue(resource, "appid") !== config.appId || textValue(resource, "mchid") !== config.merchantId || textValue(resource, "out_trade_no") !== payment.paymentNo) throw unverified
      switch (textValue(resource, "trade_state")) {
        case "SUCCESS":
        case "REFUND": {
          const amount = record(resource["amount"])
          if (payment.providerTransactionId !== null && textValue(resource, "transaction_id") !== payment.providerTransactionId) throw unverified
          if (fenValue(amount, "total") !== payment.amountFen || textValue(amount, "currency") !== "CNY") throw unverified
          if (providerBillDate(resource["success_time"]) === date) return false
          break
        }
        case "NOTPAY":
        case "CLOSED": {
          if (payment.status === "succeeded" || payment.status === "refunded" || payment.providerTransactionId !== null || resource["success_time"] !== undefined || resource["transaction_id"] !== undefined) throw unverified
          if (resource["amount"] !== undefined) {
            const amount = record(resource["amount"])
            if ((amount["total"] !== undefined && fenValue(amount, "total") !== payment.amountFen) || (amount["currency"] !== undefined && textValue(amount, "currency") !== "CNY")) throw unverified
          }
          break
        }
        default: throw unverified
      }
    }
    const paymentsByOrder = new Map(payments.map(payment => [payment.orderId, payment]))
    for (const refund of refunds) {
      const payment = refund.orderId === null ? undefined : paymentsByOrder.get(refund.orderId)
      if (refund.outRefundNo === null || payment === undefined) throw unverified
      const resource = await this.client.request(`/v3/refund/domestic/refunds/${encodeURIComponent(refund.outRefundNo)}`)
      const amount = record(resource["amount"])
      if (refund.providerTransactionId !== null && textValue(resource, "refund_id") !== refund.providerTransactionId) throw unverified
      if (textValue(resource, "out_refund_no") !== refund.outRefundNo || textValue(resource, "out_trade_no") !== payment.paymentNo || fenValue(amount, "refund") !== refund.amountFen || fenValue(amount, "total") !== payment.amountFen || textValue(amount, "currency") !== "CNY") throw unverified
      switch (textValue(resource, "status")) {
        case "SUCCESS": case "PROCESSING": case "CLOSED": case "ABNORMAL":
          if (providerBillDate(resource["create_time"]) === date) return false
          break
        default: throw unverified
      }
    }
    return true
  }

  async get(dateValue: unknown): Promise<PaymentReconciliationResponse> {
    const date = billDate(dateValue)
    const manager = (await this.database.getDataSource()).manager
    const record = await manager.findOneBy(WechatBillReconciliationEntity, { billDate: date })
    if (record === null) throw new BadRequestException({ code: "wechat_bill_not_reconciled", message: "wechat bill was not reconciled" })
    const rows = await manager.findBy(WechatBillDifferenceEntity, { reconciliationId: record.id })
    return {
      billDate: record.billDate,
      contentHash: record.contentHash,
      differenceCount: record.differenceCount,
      confirmedNote: record.confirmedNote,
      differences: rows.filter(isStoredBillDifference).map((row) => ({
        kind: row.kind,
        outTradeNo: row.outTradeNo,
        outRefundNo: row.outRefundNo,
        wechatAmountFen: row.wechatAmountFen,
        localAmountFen: row.localAmountFen,
        wechatRefundFen: row.wechatRefundFen,
        localRefundFen: row.localRefundFen,
        summary: row.summary,
      })),
    }
  }

  async confirm(dateValue: unknown, note: unknown): Promise<PaymentReconciliationResponse> {
    const date = billDate(dateValue)
    if (typeof note !== "string" || note.length === 0 || note.length > 500) {
      throw new BadRequestException({ code: "wechat_bill_note_invalid", message: "wechat reconciliation note is invalid" })
    }
    const dataSource = await this.database.getDataSource()
    await dataSource.getRepository(WechatBillReconciliationEntity).update({ billDate: date }, { confirmedNote: note })
    return this.get(date)
  }
}

function providerBillDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new BadGatewayException({ code: "wechat_bill_date_unverified", message: "微信交易日期无法核实，对账未保存" })
  }
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function buildBillDifferences(input: BillReconciliationInput): readonly BillDifference[] {
  const refunds = input.refunds ?? []
  for (const row of input.rows) {
    if (row.appId !== input.merchant.appId || row.merchantId !== input.merchant.merchantId) {
      throw new BadRequestException({ code: "wechat_bill_merchant_mismatch", message: "wechat bill merchant does not match" })
    }
  }
  const paymentDifferences = buildPaymentDifferences(input.rows, input.payments)
  const refundDifferences = buildRefundDifferences(input.rows, refunds)
  return [...paymentDifferences, ...refundDifferences].sort((left, right) => `${left.kind}:${left.outTradeNo}:${left.outRefundNo ?? ""}`.localeCompare(`${right.kind}:${right.outTradeNo}:${right.outRefundNo ?? ""}`))
}

function buildPaymentDifferences(rows: readonly BillRow[], payments: readonly { readonly paymentNo: string; readonly amountFen: number }[]): readonly BillDifference[] {
  const billRows = groupPaymentBillRows(rows)
  const localRows = new Map(payments.map((payment) => [payment.paymentNo, payment]))
  const keys = [...new Set([...billRows.keys(), ...localRows.keys()])].sort()
  return keys.map((key) => {
    const bills = billRows.get(key) ?? []
    const bill = bills[0]
    const local = localRows.get(key)
    if (bills.length > 1) return billDifference({ kind: "amount_mismatch", outTradeNo: key, outRefundNo: null, wechatAmountFen: bill?.amountFen ?? null, localAmountFen: local?.amountFen ?? null, wechatRefundFen: null, localRefundFen: null, summary: "wechat bill has duplicate payment rows" })
    if (bill === undefined && local !== undefined) return billDifference({ kind: "local_only", outTradeNo: key, outRefundNo: null, wechatAmountFen: null, localAmountFen: local.amountFen, wechatRefundFen: null, localRefundFen: null, summary: "local payment is missing from wechat bill" })
    if (bill !== undefined && local === undefined) return billDifference({ kind: "wechat_only", outTradeNo: key, outRefundNo: null, wechatAmountFen: bill.amountFen, localAmountFen: null, wechatRefundFen: null, localRefundFen: null, summary: "wechat bill row is missing locally" })
    if (bill !== undefined && local !== undefined && bill.amountFen !== local.amountFen) return billDifference({ kind: "amount_mismatch", outTradeNo: key, outRefundNo: null, wechatAmountFen: bill.amountFen, localAmountFen: local.amountFen, wechatRefundFen: null, localRefundFen: null, summary: "wechat bill amount differs from local payment" })
    const amount = bill?.amountFen ?? local?.amountFen ?? 0
    return billDifference({ kind: "matched", outTradeNo: key, outRefundNo: null, wechatAmountFen: amount, localAmountFen: amount, wechatRefundFen: null, localRefundFen: null, summary: "matched" })
  })
}

function groupPaymentBillRows(rows: readonly BillRow[]): ReadonlyMap<string, readonly BillRow[]> {
  const groups = new Map<string, BillRow[]>()
  for (const row of rows) {
    if (isRefundBillRow(row)) continue
    const group = groups.get(row.outTradeNo) ?? []
    group.push(row)
    groups.set(row.outTradeNo, group)
  }
  for (const [key, group] of groups) {
    groups.set(key, [...group].sort(compareBillRows))
  }
  return groups
}

function isRefundBillRow(row: BillRow): boolean {
  return row.state === "REFUND" || row.outRefundNo.length > 0 || row.refundFen > 0
}

function compareBillRows(left: BillRow, right: BillRow): number {
  return `${left.tradedAt}:${left.transactionId}`.localeCompare(`${right.tradedAt}:${right.transactionId}`)
}

function buildRefundDifferences(rows: readonly BillRow[], refunds: readonly { readonly outRefundNo: string | null; readonly outTradeNo: string | null; readonly amountFen: number }[]): readonly BillDifference[] {
  const billRefunds = rows.filter((row) => row.outRefundNo.length > 0 || row.refundFen > 0)
  const billByRefundNo = new Map(billRefunds.map((row) => [row.outRefundNo, row]))
  const localByRefundNo = new Map(refunds.filter((refund) => refund.outRefundNo !== null).map((refund) => [refund.outRefundNo ?? "", refund]))
  const keys = [...new Set([...billByRefundNo.keys(), ...localByRefundNo.keys()])].filter((key) => key.length > 0).sort()
  return keys.flatMap((key) => {
    const bill = billByRefundNo.get(key)
    const local = localByRefundNo.get(key)
    if (bill === undefined && local !== undefined) return [billDifference({ kind: "refund_mismatch", outTradeNo: local.outTradeNo ?? "", outRefundNo: key, wechatAmountFen: null, localAmountFen: null, wechatRefundFen: null, localRefundFen: local.amountFen, summary: "local refund is missing from wechat bill" })]
    if (bill !== undefined && local === undefined) return [billDifference({ kind: "refund_mismatch", outTradeNo: bill.outTradeNo, outRefundNo: key, wechatAmountFen: null, localAmountFen: null, wechatRefundFen: bill.refundFen, localRefundFen: null, summary: "wechat refund is missing locally" })]
    if (bill !== undefined && local !== undefined && bill.refundFen !== local.amountFen) return [billDifference({ kind: "refund_mismatch", outTradeNo: bill.outTradeNo, outRefundNo: key, wechatAmountFen: null, localAmountFen: null, wechatRefundFen: bill.refundFen, localRefundFen: local.amountFen, summary: "wechat refund amount differs from local refund" })]
    return []
  })
}

function billDifference(input: BillDifferenceInput): BillDifference {
  return input
}

function isStoredBillDifference(row: WechatBillDifferenceEntity): row is WechatBillDifferenceEntity & { readonly kind: BillDifference["kind"] } {
  return row.kind === "wechat_only" || row.kind === "local_only" || row.kind === "amount_mismatch" || row.kind === "refund_mismatch" || row.kind === "matched"
}
