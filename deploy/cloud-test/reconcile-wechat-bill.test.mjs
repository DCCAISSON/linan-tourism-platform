import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const source = await fs.readFile('deploy/cloud-test/reconcile-wechat-bill.mjs', 'utf8')
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'linan-bill-runner-'))
const cases = []
async function run(label, { argv = [], at = '2026-10-04T02:05:00Z', differenceCount = 0, errorCode, writeFails = false } = {}) {
  const lines = [], calls = []
  let closed = false
  const child = { argv: ['node', 'runner.mjs', ...argv], env: {}, exitCode: 0 }
  class FrozenDate extends Date { constructor(...args) { super(...(args.length ? args : [at])) } static now() { return Date.parse(at) } }
  const context = vm.createContext({ process: child, Date: FrozenDate, console: { log: value => lines.push(value), error: value => lines.push(value) } })
  async function module(exports) { const m = new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value) }, { context }); await m.link(() => {}); await m.evaluate(); return m }
  const main = new vm.SourceTextModule(source, { context, importModuleDynamically: async specifier => {
    if (specifier.endsWith('configuration-database.service.js')) return module({ ConfigurationDatabaseService: class { async onModuleDestroy() { closed = true } } })
    if (specifier.endsWith('wechat-pay.client.js')) return module({ WechatPayClient: class {} })
    if (specifier.endsWith('wechat-reconciliation.service.js')) return module({ WechatReconciliationService: class { async reconcile(date) { calls.push(date); if (errorCode) throw { getResponse: () => ({ code: errorCode, message: 'SECRET_MUST_NOT_APPEAR' }) }; return { billDate: date, differenceCount, contentHash: 'a'.repeat(64) } } } })
    throw new Error('unexpected import')
  } })
  await main.link(async specifier => {
    if (specifier === 'node:fs/promises') return module({ default: {
      mkdir: async () => {},
      appendFile: async (file, content, options) => { if (writeFails) throw new Error('SECRET_MUST_NOT_APPEAR'); return fs.appendFile(path.join(temporary, path.basename(file)), content, options) },
    } })
    throw new Error('unexpected import')
  })
  let thrown
  try { await main.evaluate() } catch (error) { thrown = error.message }
  assert.ok(!lines.join('\n').includes('SECRET_MUST_NOT_APPEAR'))
  const receipt = lines.filter(line => line.startsWith('{')).map(line => JSON.parse(line)).at(-1)
  const result = { label, exitCode: child.exitCode, calls, closed, receipt, thrown }
  cases.push(result)
  return result
}
try {
  assert.deepEqual((await run('daily-yesterday')).calls, ['2026-10-03'])
  assert.deepEqual((await run('shanghai-midnight', { at: '2026-10-03T16:00:00Z' })).calls, ['2026-10-03'])
  assert.deepEqual((await run('before-shanghai-midnight', { at: '2026-10-03T15:59:59Z' })).calls, ['2026-10-02'])
  assert.deepEqual((await run('year-boundary', { at: '2027-01-01T02:05:00Z' })).calls, ['2026-12-31'])
  assert.deepEqual((await run('manual-backfill', { argv: ['2026-09-30'] })).calls, ['2026-09-30'])
  const repeated = await run('same-date-repeat')
  assert.equal(repeated.receipt.completed, true)
  assert.equal(repeated.closed, true)
  assert.equal((await fs.readFile(path.join(temporary, '2026-10-03.jsonl'), 'utf8')).trim().split('\n').length, 3)
  for (const value of ['2026-02-30', '2026-10-04', '../bad', '2026-9-30']) {
    const result = await run('invalid-date-' + value, { argv: [value] })
    assert.equal(result.receipt.code, 'invalid_bill_date'); assert.equal(result.calls.length, 0); assert.equal(result.exitCode, 1)
  }
  const difference = await run('differences', { differenceCount: 2 })
  assert.equal(difference.exitCode, 2); assert.equal(difference.receipt.code, 'differences_found')
  const failed = await run('missing-bill', { errorCode: 'wechat_bill_download_failed' })
  assert.equal(failed.exitCode, 1); assert.equal(failed.receipt.completed, false); assert.equal(failed.closed, true)
  const unavailable = await run('bill-not-available', { errorCode: 'wechat_bill_not_available' })
  assert.equal(unavailable.exitCode, 1); assert.equal(unavailable.receipt.completed, false); assert.equal(unavailable.closed, true)
  assert.equal(unavailable.receipt.code, 'wechat_bill_not_available')
  assert.equal('differenceCount' in unavailable.receipt, false); assert.equal('contentHash' in unavailable.receipt, false)
  const unsafe = await run('unsafe-error', { errorCode: 'SECRET_MUST_NOT_APPEAR with body' })
  assert.equal(unsafe.receipt.code, 'reconciliation_failed')
  const disk = await run('receipt-failure', { writeFails: true })
  assert.equal(disk.exitCode, 1); assert.equal(disk.receipt.code, 'receipt_write_failed')
  console.log(JSON.stringify({ passed: true, tests: cases.length }))
} finally { await fs.rm(temporary, { recursive: true, force: true }) }
