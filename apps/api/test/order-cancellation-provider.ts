import { createCipheriv, generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { createServer, type ServerResponse } from "node:http"
import type { WechatPayConfig } from "../src/modules/wechat/wechat-config.js"

export function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>(done => { resolve = () => done() })
  return { promise, resolve }
}

export async function createCancellationProvider() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const states = new Map<string, string>()
  const calls: string[] = []
  const failure = { close: false, closeAfterCommit: false, wrongApp: false }
  let gate: { readonly operation: string; readonly entered: ReturnType<typeof deferred>; readonly released: ReturnType<typeof deferred> } | undefined
  const config: WechatPayConfig = {
    appId: "cancellation-app", merchantId: "cancellation-merchant", serialNo: "cancellation-serial",
    privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), publicKeyId: "cancellation-public",
    apiV3Key: "12345678901234567890123456789012", notifyUrl: "https://example.test/payment",
    refundNotifyUrl: "https://example.test/refund", apiOrigin: "http://127.0.0.1",
  }
  function signedHeaders(body: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString(), nonce = randomBytes(8).toString("hex")
    return { "wechatpay-timestamp": timestamp, "wechatpay-nonce": nonce, "wechatpay-serial": config.publicKeyId,
      "wechatpay-signature": sign("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), keys.privateKey).toString("base64") }
  }
  function respond(response: ServerResponse, status: number, payload?: object) {
    const body = payload === undefined ? "" : JSON.stringify(payload)
    response.writeHead(status, { ...signedHeaders(body), "Content-Type": "application/json" })
    response.end(body)
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const operation = url.pathname.endsWith("/jsapi") ? "create" : url.pathname.endsWith("/close") ? "close" : "query"
    calls.push(operation)
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    const payload: unknown = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8"))
    const paymentNo = operation === "create" && typeof payload === "object" && payload !== null && "out_trade_no" in payload
      ? String(payload.out_trade_no) : decodeURIComponent(url.pathname.split("/")[5] ?? "")
    if (gate?.operation === operation) { const current = gate; gate = undefined; current.entered.resolve(); await current.released.promise }
    if (operation === "create") {
      if (states.get(paymentNo) === "CLOSED") return respond(response, 400, { code: "TRADE_ERROR" })
      states.set(paymentNo, "NOTPAY")
      return respond(response, 200, { prepay_id: "fixture-prepay" })
    }
    const state = states.get(paymentNo)
    if (state === undefined) return respond(response, 404, { code: "ORDER_NOT_EXIST" })
    if (operation === "close") {
      if (state !== "NOTPAY" && state !== "CLOSED") return respond(response, 403, { code: "TRADE_ERROR" })
      if (failure.close) return respond(response, 500, { code: "SYSTEM_ERROR" })
      states.set(paymentNo, "CLOSED")
      return failure.closeAfterCommit ? respond(response, 500, { code: "SYSTEM_ERROR" }) : respond(response, 204)
    }
    return respond(response, 200, { appid: failure.wrongApp ? "other-app" : config.appId, mchid: config.merchantId, out_trade_no: paymentNo, trade_state: state })
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new TypeError("fixture must bind TCP")
  return {
    config: { ...config, apiOrigin: `http://127.0.0.1:${address.port}` }, states, calls, failure,
    block(operation: "create" | "close") {
      const entered = deferred(), released = deferred()
      gate = { operation, entered, released }
      return { entered: entered.promise, release: released.resolve }
    },
    callback(paymentNo: string, eventId: string, amountFen: number) {
      const nonce = randomBytes(12).toString("hex").slice(0, 12), associatedData = "cancellation-test"
      const cipher = createCipheriv("aes-256-gcm", Buffer.from(config.apiV3Key), Buffer.from(nonce))
      cipher.setAAD(Buffer.from(associatedData))
      const resource = JSON.stringify({ appid: config.appId, mchid: config.merchantId, out_trade_no: paymentNo,
        transaction_id: `tx-${eventId}`, trade_state: "SUCCESS", amount: { total: amountFen, currency: "CNY" } })
      const ciphertext = Buffer.concat([cipher.update(resource), cipher.final(), cipher.getAuthTag()]).toString("base64")
      const body = JSON.stringify({ id: eventId, resource: { algorithm: "AEAD_AES_256_GCM", ciphertext, nonce, associated_data: associatedData } })
      return { body, headers: signedHeaders(body) }
    },
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}
