import { BadRequestException } from "@nestjs/common"

export type BillRow = { readonly appId: string; readonly merchantId: string; readonly transactionId: string; readonly outTradeNo: string; readonly state: string; readonly amountFen: number; readonly refundFen: number; readonly outRefundNo: string; readonly tradedAt: string }

export function yuanToFen(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new BadRequestException("账单金额须为非负元金额，最多两位小数")
  const [yuan = "", decimal = ""] = value.split(".")
  const fen = BigInt(yuan) * 100n + BigInt(decimal.padEnd(2, "0"))
  if (fen > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException("账单金额过大")
  return Number(fen)
}

export function parseTradeBill(input: string): readonly BillRow[] {
  const lines = input.replace(/^\uFEFF/, "").trim().split(/\r?\n/)
  const columns = (lines.shift() ?? "").split(",").map(cell => cell.trim())
  const amountColumn = columns.includes("订单金额") ? "订单金额" : "应结订单金额"
  const required = ["交易时间", "公众账号ID", "商户号", "微信订单号", "商户订单号", "交易状态", amountColumn, "退款金额", "商户退款单号"]
  if (required.some(name => !columns.includes(name))) throw new BadRequestException("账单表头不完整（仅支持微信ALL交易账单）")
  const rows: BillRow[] = []
  for (const line of lines) {
    if (line.startsWith("总交易单数")) break
    if (!line.trim()) continue
    const cells = line.split(",").map(cell => cell.trim().replace(/^`/, ""))
    if (cells.length !== columns.length) throw new BadRequestException("账单明细列数不正确")
    const read = (name: string) => cells[columns.indexOf(name)] ?? ""
    const state = read("交易状态")
    if (state !== "SUCCESS" && state !== "REFUND") throw new BadRequestException("账单交易状态不支持")
    const refundNo = read("商户退款单号")
    rows.push({ tradedAt: read("交易时间"), appId: read("公众账号ID"), merchantId: read("商户号"), transactionId: read("微信订单号"), outTradeNo: read("商户订单号"), state, amountFen: yuanToFen(read(amountColumn)), refundFen: yuanToFen(read("退款金额")), outRefundNo: refundNo === "0" ? "" : refundNo })
  }
  return rows
}
