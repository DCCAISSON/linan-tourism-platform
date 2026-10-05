import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const now = Date.now()
const day = 24 * 60 * 60 * 1000
const shanghaiToday = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
const backupDirectory = '/opt/linan-test/backups/product-closure-20261003'
const require = createRequire('/opt/linan-test/app/apps/api/package.json')
const checks = []
const run = (command, args) => execFileSync(command, args, {
  encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const properties = unit => Object.fromEntries(run('systemctl', ['show', unit,
  '-p', 'LoadState', '-p', 'ActiveState', '-p', 'UnitFileState', '-p', 'Result', '-p', 'ExecMainStatus', '-p', 'User',
]).split('\n').map(line => {
  const at = line.indexOf('=')
  return [line.slice(0, at), line.slice(at + 1)]
}))
async function check(name, inspect) {
  try { checks.push({ name, ...await inspect() }) }
  catch { checks.push({ name, passed: false, code: 'inspection_failed' }) }
}
function scheduledRun(time) {
  let at = Date.parse(`${shanghaiToday}T${time}:00+08:00`)
  // 两个既有作业均限时五分钟，另留五分钟给调度及回执完成。
  if (now < at + 10 * 60 * 1000) at -= day
  return at
}
function certificate(file) {
  const dates = Object.fromEntries(run('openssl', ['x509', '-in', file, '-noout', '-startdate', '-enddate'])
    .split('\n').map(line => line.split('=')))
  const validFrom = Date.parse(dates.notBefore), validUntil = Date.parse(dates.notAfter)
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil)) throw Error('invalid_certificate_dates')
  const remainingDays = Math.floor((validUntil - now) / day)
  const due = validUntil - now <= 30 * day
  return { passed: validFrom <= now && !due,
    code: validFrom > now ? 'certificate_not_yet_valid' : due ? 'certificate_due' : 'ok',
    expiresAt: new Date(validUntil).toISOString(), remainingDays }
}

await check('api_service', () => {
  const state = properties('linan-test-api.service')
  const passed = state.LoadState === 'loaded' && state.ActiveState === 'active' && state.UnitFileState === 'enabled'
  return { passed, code: passed ? 'ok' : 'service_unavailable' }
})
await check('api_health', async () => {
  const response = await fetch('https://api.linantravel.cn/health', { redirect: 'error', signal: AbortSignal.timeout(10000) })
  const body = await response.json()
  const revision = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(body.revision ?? '') ? body.revision : null
  const passed = response.status === 200 && body.status === 'ok' && body.service === '@linan/api'
    && revision !== null && revision === process.env.REVISION
  return { passed, code: passed ? 'ok' : 'health_or_revision_mismatch', status: response.status, revision }
})
await check('database_read', async () => {
  const started = Date.now()
  const url = new URL(process.env.DATABASE_URL)
  const database = await require('mysql2/promise').createConnection({ host: url.hostname, port: Number(url.port || 3306),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), connectTimeout: 10000 })
  let passed
  try {
    const [rows] = await database.query({ sql: 'SELECT 1 AS ok', timeout: 10000 })
    passed = rows[0]?.ok === 1
  } finally { await database.end() }
  return { passed, code: passed ? 'ok' : 'database_probe_failed', durationMs: Date.now() - started }
})
await check('cos_bucket_read', async () => {
  const started = Date.now()
  const COS = require('cos-nodejs-sdk-v5')
  const client = new COS({ SecretId: process.env.TENCENT_CLOUD_SECRET_ID, SecretKey: process.env.TENCENT_CLOUD_SECRET_KEY, Timeout: 10000 })
  try {
    await client.headBucket({ Bucket: process.env.TENCENT_CLOUD_COS_BUCKET, Region: process.env.TENCENT_CLOUD_REGION })
    return { passed: true, code: 'ok', durationMs: Date.now() - started }
  } catch (error) {
    return { passed: false, code: error?.statusCode === 403 ? 'cos_probe_forbidden' : 'cos_probe_failed', durationMs: Date.now() - started }
  }
})
await check('request_failures_15m', () => {
  const windowEnd = Date.now()
  const journal = run('journalctl', ['-u', 'linan-test-api.service', '--since', '-15min', '--no-pager', '-o', 'cat'])
  let requests = 0, serverErrors = 0, aborted = 0
  const callbacks = { payments: { requests: 0, rejected4xx: 0, failed5xx: 0, otherNon2xx: 0, aborted: 0 }, refunds: { requests: 0, rejected4xx: 0, failed5xx: 0, otherNon2xx: 0, aborted: 0 } }
  for (const line of journal.split('\n')) {
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    if (entry?.event !== 'http_request') continue
    const timestamp = Date.parse(entry.timestamp)
    const interrupted = entry.aborted === true && entry.status === null
    if (!Number.isFinite(timestamp) || timestamp < windowEnd - 15 * 60 * 1000 || timestamp > windowEnd
      || (!interrupted && (!Number.isInteger(entry.status) || entry.status < 100 || entry.status > 599))) continue
    requests++
    if (interrupted) aborted++
    if (entry.status >= 500) serverErrors++
    const callback = entry.route === '/wechat/payments/callback' ? callbacks.payments : entry.route === '/wechat/refunds/callback' ? callbacks.refunds : null
    if (!callback) continue
    callback.requests++
    if (interrupted) callback.aborted++
    else if (entry.status >= 500) callback.failed5xx++
    else if (entry.status >= 400) callback.rejected4xx++
    else if (entry.status < 200 || entry.status >= 300) callback.otherNon2xx++
  }
  if (requests === 0) return { passed: false, code: 'request_log_sample_missing', requests: null, serverErrors: null, aborted: null, callbacks: null }
  const passed = serverErrors === 0 && aborted === 0 && Object.values(callbacks).every(value => value.rejected4xx + value.failed5xx + value.otherNon2xx === 0)
  return { passed, code: passed ? 'ok' : 'request_failures_observed', requests, serverErrors, aborted, callbacks }
})
for (const [name, directory] of [['application', '/opt/linan-test/app'], ['backup', backupDirectory], ['bill_receipts', '/var/lib/linan-wechat-bill-reconciliation']]) {
  await check(`disk_${name}`, () => {
    const disk = fs.statfsSync(directory)
    const availableBytes = Number(disk.bavail) * Number(disk.bsize)
    const totalBytes = Number(disk.blocks) * Number(disk.bsize)
    const passed = totalBytes > 0 && availableBytes >= 1024 ** 3 && availableBytes / totalBytes >= 0.1
    return { passed, code: passed ? 'ok' : 'disk_space_low', availableBytes, availablePercent: Math.floor(availableBytes / totalBytes * 100) }
  })
}
await check('https_certificate', () => certificate('/etc/letsencrypt/live/linan-test/fullchain.pem'))
await check('wechat_merchant_certificate', () => {
  const key = process.env.WECHAT_PAY_PRIVATE_KEY_PATH
  const file = path.join(path.dirname(key), 'apiclient_cert.pem')
  const expiry = certificate(file)
  const serial = run('openssl', ['x509', '-in', file, '-noout', '-serial']).replace(/^serial=/i, '').toUpperCase()
  const serialMatches = /^[A-F0-9]+$/.test(serial) && serial === process.env.WECHAT_PAY_SERIAL_NO?.toUpperCase()
  return { ...expiry, passed: expiry.passed && serialMatches, code: serialMatches ? expiry.code : 'merchant_certificate_mismatch', serialMatches }
})
await check('wechat_private_key_file', () => {
  const metadata = fs.statSync(process.env.WECHAT_PAY_PRIVATE_KEY_PATH)
  const user = properties('linan-test-api.service').User || 'root'
  const serviceUid = Number(run('id', ['-u', user]))
  const serviceGroups = run('id', ['-G', user]).split(/\s+/).map(Number)
  const owner = metadata.uid === 0 ? 'root' : metadata.uid === serviceUid ? 'api_user' : 'other'
  const serviceCanRead = metadata.uid === serviceUid ? (metadata.mode & 0o400) !== 0
    : serviceGroups.includes(metadata.gid) && (metadata.mode & 0o040) !== 0
  const passed = metadata.isFile() && owner !== 'other' && (metadata.mode & 0o137) === 0 && serviceCanRead
  return { passed, code: passed ? 'ok' : 'private_key_permissions_invalid', owner, mode: (metadata.mode & 0o777).toString(8), serviceCanRead }
})
for (const [name, unit] of [['backup', 'linan-database-backup'], ['bill', 'linan-wechat-bill-reconciliation']]) {
  await check(`${name}_timer`, () => {
    const state = properties(`${unit}.timer`)
    const passed = state.LoadState === 'loaded' && state.ActiveState === 'active' && state.UnitFileState === 'enabled'
    return { passed, code: passed ? 'ok' : 'timer_unavailable' }
  })
  await check(`${name}_service`, () => {
    const state = properties(`${unit}.service`)
    const passed = state.LoadState === 'loaded' && ['inactive', 'active', 'activating'].includes(state.ActiveState)
      && state.Result === 'success' && state.ExecMainStatus === '0'
    return { passed, code: passed ? (state.ActiveState === 'activating' ? 'running' : 'ok') : 'job_failed' }
  })
}
await check('backup_artifact', () => {
  const latest = fs.readdirSync(backupDirectory).filter(name => /^database-\d{8}T\d{6}Z-[a-f0-9]{6}\.sql\.manifest\.json$/.test(name)).sort().at(-1)
  if (!latest) return { passed: false, code: 'backup_missing' }
  const file = path.join(backupDirectory, latest)
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'))
  const createdAt = Date.parse(receipt.createdAt)
  if (!Number.isFinite(createdAt) || createdAt < scheduledRun('02:30') || createdAt > now) return { passed: false, code: 'backup_overdue_or_invalid_date' }
  const contents = fs.readFileSync(file.replace(/\.manifest\.json$/, ''))
  const passed = receipt.bytes === contents.length && receipt.bytes > 0
    && createHash('sha256').update(contents).digest('hex') === receipt.sha256
  return { passed, code: passed ? 'ok' : 'backup_digest_mismatch', createdAt: new Date(createdAt).toISOString(), bytes: contents.length }
})
await check('bill_receipt', () => {
  const dueAt = scheduledRun('10:05')
  const billDate = new Date(dueAt + 8 * 60 * 60 * 1000 - day).toISOString().slice(0, 10)
  const lines = fs.readFileSync(`/var/lib/linan-wechat-bill-reconciliation/${billDate}.jsonl`, 'utf8').trim().split('\n')
  const receipt = JSON.parse(lines.at(-1))
  const checkedAt = Date.parse(receipt.checkedAt)
  if (receipt.billDate !== billDate || !Number.isFinite(checkedAt) || checkedAt < dueAt || checkedAt > now) {
    return { passed: false, code: 'bill_overdue_or_invalid_date', billDate }
  }
  const matched = receipt.code === 'matched' && receipt.completed === true && receipt.differenceCount === 0
    && /^[a-f0-9]{64}$/.test(receipt.contentHash ?? '')
  const noStatement = receipt.code === 'no_statement_no_local_transactions' && receipt.completed === false
    && receipt.differenceCount === undefined && receipt.contentHash === undefined
  const passed = matched || noStatement
  return { passed, code: passed ? receipt.code : 'bill_failed_or_differences', billDate, completed: receipt.completed === true }
})

const passed = checks.every(result => result.passed)
console.log(JSON.stringify({ checkedAt: new Date(now).toISOString(), readOnly: true, passed, checks }))
if (!passed) process.exitCode = 1
