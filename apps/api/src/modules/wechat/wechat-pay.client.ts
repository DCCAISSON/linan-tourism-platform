import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common"
import { createHash } from "node:crypto"
import { loadWechatPayConfig, type WechatPayConfig } from "./wechat-config.js"
import { signWechatRequest, verifyWechatSignature } from "./wechat-crypto.js"
import { wechatHttp } from "./wechat-http.js"
import { parseJson, record, textValue } from "./wechat-parser.js"

export class WechatPayRequestError extends BadGatewayException {
  constructor(readonly providerStatus: number, readonly providerCode: string) {
    super({ code: "wechat_request_rejected", message: "微信未完成请求，请查询原交易或核对配置", providerStatus })
  }
}

@Injectable()
export class WechatPayClient {
  config(): WechatPayConfig { return loadWechatPayConfig() }

  async request(path: string, body?: object): Promise<Record<string, unknown>> {
    const config = this.config()
    const request = { method: body === undefined ? "GET" as const : "POST" as const, path, body: body === undefined ? "" : JSON.stringify(body) }
    const response = await wechatHttp(new URL(path, config.apiOrigin), { ...request, headers: { Authorization: signWechatRequest(config, request), Accept: "application/json", "Content-Type": "application/json", "Wechatpay-Serial": config.publicKeyId } })
    const raw = response.body.toString("utf8")
    if (response.status < 200 || response.status >= 300) {
      throw new WechatPayRequestError(response.status, textValue(record(parseJson(raw)), "code"))
    }
    verifyWechatSignature(config, response.headers, raw)
    if (response.status === 204) return {}
    return record(parseJson(raw))
  }

  async downloadBill(date: string): Promise<{ readonly content: Buffer; readonly hashType: string; readonly hash: string }> {
    const config = this.config()
    const response = await this.request(`/v3/bill/tradebill?bill_date=${encodeURIComponent(date)}&bill_type=ALL`)
    const url = new URL(textValue(response, "download_url"))
    if (url.origin !== config.apiOrigin || !url.pathname.startsWith("/v3/billdownload/file")) throw new BadRequestException("微信账单下载地址不受信任")
    const request = { method: "GET" as const, path: `${url.pathname}${url.search}`, body: "" }
    const downloaded = await wechatHttp(url, { method: "GET", headers: { Authorization: signWechatRequest(config, request) } })
    if (downloaded.status !== 200) throw new BadGatewayException("微信账单下载失败")
    const hashType = textValue(response, "hash_type")
    const hash = textValue(response, "hash_value").toLowerCase()
    verifyBillHash(downloaded.body, hashType, hash)
    return { content: downloaded.body, hashType, hash }
  }
}

export function verifyBillHash(content: Buffer, type: string, hash: string): void {
  if (type !== "SHA1" && type !== "SHA256") throw new BadRequestException("账单哈希算法不支持")
  if (createHash(type.toLowerCase()).update(content).digest("hex") !== hash.toLowerCase()) throw new BadRequestException("账单哈希不一致")
}
