import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import vm from 'node:vm'

const source = await fs.readFile('deploy/cloud-test/check-operations.mjs', 'utf8')
const day = 86400000
const revision = 'a'.repeat(40)
const cases = []
async function run(label, options = {}) {
  const at = options.at ?? '2026-10-05T03:20:00Z', now = Date.parse(at)
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10)
  const scheduled = time => {
    const due = Date.parse(`${today}T${time}:00+08:00`)
    return now < due + 600000 ? due - day : due
  }
  const due = scheduled('10:05')
  const billDate = new Date(due + 8 * 3600000 - day).toISOString().slice(0, 10)
  const backupCreatedAt = new Date(scheduled('02:30') + 1000).toISOString()
  const backup = Buffer.from('synthetic backup only')
  const backupFile = `database-${backupCreatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-abcdef.sql.manifest.json`
  const receipt = { checkedAt: new Date(due + 3000).toISOString(), billDate, completed: true, code: 'matched', differenceCount: 0, contentHash: 'b'.repeat(64), ...options.receipt }
  const lines = [], commands = [], requests = []
  let databaseClosed = false
  const child = { exitCode: 0, env: { REVISION: revision, DATABASE_URL: 'mysql://linan_app:SECRET_MUST_NOT_APPEAR@127.0.0.1:3306/linan_platform_uat', WECHAT_PAY_PRIVATE_KEY_PATH: '/secrets/apiclient_key.pem', WECHAT_PAY_SERIAL_NO: 'AABB', TENCENT_CLOUD_SECRET_ID: 'secret-id', TENCENT_CLOUD_SECRET_KEY: 'SECRET_MUST_NOT_APPEAR', TENCENT_CLOUD_COS_BUCKET: 'fixture-bucket', TENCENT_CLOUD_REGION: 'fixture-region' } }
  class FrozenDate extends Date { constructor(...args) { super(...(args.length ? args : [at])) } static now() { return now } }
  const context = vm.createContext({ process: child, Date: FrozenDate, URL, AbortSignal,
    console: { log: value => lines.push(value), error: value => lines.push(value) },
    fetch: async (url, request) => {
      requests.push({ url, request })
      if (options.healthThrows) throw Error('SECRET_MUST_NOT_APPEAR')
      return { status: options.healthStatus ?? 200, json: async () => ({ status: 'ok', service: '@linan/api', revision: options.revision ?? revision, secret: 'SECRET_MUST_NOT_APPEAR' }) }
    },
  })
  async function module(exports) {
    const result = new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value) }, { context })
    await result.link(() => {})
    await result.evaluate()
    return result
  }
  const main = new vm.SourceTextModule(source, { context })
  await main.link(async specifier => {
    if (specifier === 'node:fs') return module({ default: {
      statSync: file => {
        assert.equal(file, '/secrets/apiclient_key.pem')
        if (options.missingKey) throw Error('SECRET_MUST_NOT_APPEAR')
        return { isFile: () => true, uid: 0, gid: options.keyGroup ?? 1001, mode: options.keyMode ?? 0o640 }
      },
      statfsSync: () => ({ bsize: 1024, bavail: options.diskLow ? 100 : 5 * 1024 ** 2, blocks: 10 * 1024 ** 2 }),
      readdirSync: directory => { assert.match(directory, /backups/); return options.noBackups ? [] : [backupFile] },
      readFileSync: file => {
        if (options.missingFile && file.includes(options.missingFile)) throw Error('SECRET_MUST_NOT_APPEAR')
        if (file.endsWith('.manifest.json')) return JSON.stringify({ createdAt: options.backupCreatedAt ?? backupCreatedAt, bytes: backup.length, sha256: createHash('sha256').update(backup).digest('hex') })
        if (file.endsWith('.sql')) return options.corruptBackup ? Buffer.from('changed') : backup
        assert.equal(file, `/var/lib/linan-wechat-bill-reconciliation/${billDate}.jsonl`)
        return options.invalidReceipt ? 'invalid JSON SECRET_MUST_NOT_APPEAR' : JSON.stringify(receipt) + '\n'
      },
    } })
    if (specifier === 'node:path') return module({ default: path.posix })
    if (specifier === 'node:crypto') return module({ createHash })
    if (specifier === 'node:child_process') return module({ execFileSync: (command, args) => {
      commands.push({ command, args })
      if (command === 'systemctl') {
        assert.equal(args[0], 'show')
        const state = { LoadState: 'loaded', ActiveState: args[1].endsWith('.timer') || args[1] === 'linan-test-api.service' ? 'active' : 'inactive', UnitFileState: 'enabled', Result: 'success', ExecMainStatus: '0', User: 'ubuntu', ...(options.unit === args[1] ? options.state : {}) }
        return Object.entries(state).map(([key, value]) => `${key}=${value}`).join('\n')
      }
      if (command === 'openssl') {
        assert.equal(args[0], 'x509'); assert.ok(args.includes('-noout'))
        if (options.missingCertificate) throw Error('SECRET_MUST_NOT_APPEAR')
        if (args.includes('-serial')) return `serial=${options.serial ?? 'AABB'}`
        const remaining = args[2].includes('letsencrypt') ? (options.tlsDays ?? 60) : (options.merchantDays ?? 365)
        return `notBefore=${new Date(now - day).toUTCString()}\nnotAfter=${new Date(now + remaining * day).toUTCString()}`
      }
      if (command === 'id') return args[0] === '-u' ? '1000' : '1000 1001'
      assert.equal(command, 'journalctl')
      const journal = options.journal ?? [{ event: 'http_request', timestamp: new Date(now - 1000).toISOString(), route: '/health', status: 200 }]
      return ['SECRET_MUST_NOT_APPEAR', ...journal.map(entry => JSON.stringify(entry))].join('\n')
    } })
    if (specifier === 'node:module') return module({ createRequire: () => name => {
      if (name === 'mysql2/promise') return { createConnection: async () => {
        if (options.databaseFails) throw Error('SECRET_MUST_NOT_APPEAR')
        return { query: async query => { assert.equal(query.sql, 'SELECT 1 AS ok'); if (options.queryFails) throw Error('SECRET_MUST_NOT_APPEAR'); return [[{ ok: 1 }]] },
          end: async () => { databaseClosed = true; if (options.closeFails) throw Error('SECRET_MUST_NOT_APPEAR') } }
      } }
      assert.equal(name, 'cos-nodejs-sdk-v5')
      return class { async headBucket(parameters) { assert.equal(parameters.Bucket, 'fixture-bucket'); if (options.cosStatus) throw { statusCode: options.cosStatus, message: 'SECRET_MUST_NOT_APPEAR' } } }
    } })
    throw Error('unexpected import')
  })
  await main.evaluate()
  assert.equal(lines.length, 1)
  assert.ok(!lines[0].includes('SECRET_MUST_NOT_APPEAR'))
  const report = JSON.parse(lines[0])
  assert.equal(child.exitCode, report.passed ? 0 : 1)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://api.linantravel.cn/health')
  const result = { label, exitCode: child.exitCode, report, databaseClosed, commands }
  cases.push({ label, exitCode: child.exitCode })
  return result
}
const check = (result, name) => result.report.checks.find(item => item.name === name)
assert.equal((await run('healthy')).report.passed, true)
const noStatement = await run('normal-no-statement', { receipt: { completed: false, code: 'no_statement_no_local_transactions', differenceCount: undefined, contentHash: undefined } })
assert.equal(noStatement.report.passed, true)
assert.equal(check(noStatement, 'bill_receipt').completed, false)
for (const [label, options, name] of [
  ['api-503', { healthStatus: 503 }, 'api_health'], ['health-network-failure', { healthThrows: true }, 'api_health'],
  ['wrong-revision', { revision: 'c'.repeat(40) }, 'api_health'],
  ['database-unavailable', { databaseFails: true }, 'database_read'], ['query-failure', { queryFails: true }, 'database_read'], ['connection-close-failure', { closeFails: true }, 'database_read'],
  ['cos-403', { cosStatus: 403 }, 'cos_bucket_read'], ['cos-failure', { cosStatus: 500 }, 'cos_bucket_read'],
  ['missing-log-sample', { journal: [] }, 'request_failures_15m'],
  ['disk-full', { diskLow: true }, 'disk_backup'], ['tls-near-expiry', { tlsDays: 30 }, 'https_certificate'],
  ['tls-expired', { tlsDays: -1 }, 'https_certificate'], ['merchant-near-expiry', { merchantDays: 20 }, 'wechat_merchant_certificate'],
  ['merchant-wrong-serial', { serial: 'CCDD' }, 'wechat_merchant_certificate'], ['missing-certificate', { missingCertificate: true }, 'https_certificate'],
  ['missing-key', { missingKey: true }, 'wechat_private_key_file'], ['key-readable-by-others', { keyMode: 0o644 }, 'wechat_private_key_file'],
  ['key-wrong-group', { keyGroup: 1002 }, 'wechat_private_key_file'], ['key-group-writable', { keyMode: 0o660 }, 'wechat_private_key_file'],
  ['backup-failed', { unit: 'linan-database-backup.service', state: { Result: 'exit-code', ExecMainStatus: '1' } }, 'backup_service'],
  ['bill-failed', { unit: 'linan-wechat-bill-reconciliation.service', state: { Result: 'exit-code', ExecMainStatus: '2' } }, 'bill_service'],
  ['timer-disabled', { unit: 'linan-database-backup.timer', state: { UnitFileState: 'disabled' } }, 'backup_timer'],
  ['missing-backup', { noBackups: true }, 'backup_artifact'], ['missing-sql', { missingFile: '.sql' }, 'backup_artifact'],
  ['corrupt-backup', { corruptBackup: true }, 'backup_artifact'], ['overdue-backup', { backupCreatedAt: '2026-10-03T18:30:01Z' }, 'backup_artifact'],
  ['missing-bill', { missingFile: '.jsonl' }, 'bill_receipt'], ['malformed-bill', { invalidReceipt: true }, 'bill_receipt'],
  ['bill-differences', { receipt: { code: 'differences_found', differenceCount: 1 } }, 'bill_receipt'],
  ['no-statement-with-false-total', { receipt: { code: 'no_statement_no_local_transactions', completed: false } }, 'bill_receipt'],
  ['overdue-bill', { receipt: { checkedAt: '2026-10-04T02:05:03Z' } }, 'bill_receipt'],
]) {
  const result = await run(label, options)
  assert.equal(check(result, name).passed, false, label)
  assert.equal(result.exitCode, 1, label)
  if (options.queryFails || options.closeFails) assert.equal(result.databaseClosed, true)
}
const beforeBill = await run('before-bill-deadline', { at: '2026-10-05T02:14:59Z' })
assert.equal(beforeBill.report.passed, true)
assert.equal(check(beforeBill, 'bill_receipt').billDate, '2026-10-03')
assert.equal((await run('before-backup-deadline', { at: '2026-10-04T18:39:59Z' })).report.passed, true)
const failures = await run('request-failure-aggregation', { journal: [
  { event: 'http_request', timestamp: '2026-10-05T03:19:00Z', route: '/wechat/payments/callback', status: 401, secret: 'SECRET_MUST_NOT_APPEAR' },
  { event: 'http_request', timestamp: '2026-10-05T03:19:01Z', route: '/wechat/refunds/callback', status: 500 },
  { event: 'http_request', timestamp: '2026-10-05T03:19:02Z', route: '/other', status: 503 },
  { event: 'http_request', timestamp: '2026-10-05T02:00:00Z', route: '/other', status: 503 },
] })
assert.equal(check(failures, 'request_failures_15m').requests, 3)
assert.equal(check(failures, 'request_failures_15m').serverErrors, 2)
assert.equal(check(failures, 'request_failures_15m').callbacks.payments.rejected4xx, 1)
assert.equal(failures.exitCode, 1)
const interrupted = await run('aborted-callback', { journal: [
  { event: 'http_request', timestamp: '2026-10-05T03:19:00Z', route: '/wechat/payments/callback', status: null, aborted: true },
] })
assert.equal(check(interrupted, 'request_failures_15m').aborted, 1)
assert.equal(check(interrupted, 'request_failures_15m').callbacks.payments.aborted, 1)
assert.equal(interrupted.exitCode, 1)
console.log(JSON.stringify({ passed: true, tests: cases.length, cases }))
