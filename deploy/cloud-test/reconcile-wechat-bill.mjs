import fs from "node:fs/promises"

const directory = "/var/lib/linan-wechat-bill-reconciliation"
const yesterday = new Date(Date.now() + (8 - 24) * 60 * 60 * 1000).toISOString().slice(0, 10)
const date = process.argv[2] ?? yesterday

if (process.argv[2] === "--help") {
  console.log("用法：reconcile-wechat-bill.mjs [YYYY-MM-DD]；默认北京时间昨日，仅允许已结束日期。请通过同一 flock 锁运行。")
} else if (process.argv.length > 3 || !/^\d{4}-\d{2}-\d{2}$/.test(date)
  || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
  || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > yesterday) {
  console.error(JSON.stringify({ completed: false, code: "invalid_bill_date" }))
  process.exitCode = 1
} else {
  let database
  let receipt = { checkedAt: new Date().toISOString(), billDate: date, completed: false, code: "reconciliation_failed" }
  try {
    const base = "/opt/linan-test/app/apps/api/dist/modules/"
    const { ConfigurationDatabaseService } = await import(base + "configuration/configuration-database.service.js")
    const { WechatPayClient } = await import(base + "wechat/wechat-pay.client.js")
    const { WechatReconciliationService } = await import(base + "wechat/wechat-reconciliation.service.js")
    database = new ConfigurationDatabaseService()
    const result = await new WechatReconciliationService(database, new WechatPayClient()).reconcile(date)
    receipt = {
      checkedAt: new Date().toISOString(), billDate: result.billDate, completed: true,
      code: result.differenceCount === 0 ? "matched" : "differences_found",
      differenceCount: result.differenceCount, contentHash: result.contentHash,
    }
    if (result.differenceCount !== 0) process.exitCode = 2
  } catch (error) {
    const response = typeof error?.getResponse === "function" ? error.getResponse() : null
    const code = response?.code
    if (typeof code === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(code)) receipt.code = code
    process.exitCode = 1
  } finally {
    if (database !== undefined) {
      try { await database.onModuleDestroy() }
      catch { receipt = { ...receipt, completed: false, code: "database_close_failed" }; process.exitCode = 1 }
    }
    console.log(JSON.stringify(receipt))
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      await fs.appendFile(`${directory}/${date}.jsonl`, JSON.stringify(receipt) + "\n", { mode: 0o600 })
    } catch {
      console.error(JSON.stringify({ billDate: date, completed: false, code: "receipt_write_failed" }))
      process.exitCode = 1
    }
  }
}
