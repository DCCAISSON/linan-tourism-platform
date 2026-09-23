import { readFileSync } from "node:fs"
import { ServiceUnavailableException } from "@nestjs/common"

export type WechatPayConfig = { readonly appId: string; readonly merchantId: string; readonly serialNo: string; readonly privateKey: string; readonly publicKeyId: string; readonly publicKey: string; readonly apiV3Key: string; readonly notifyUrl: string; readonly refundNotifyUrl: string; readonly apiOrigin: string }
export function requiredWechatEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new ServiceUnavailableException({ code: "wechat_unconfigured", message: "微信服务尚未配置" })
  return value
}
export function loadWechatPayConfig(): WechatPayConfig {
  if (process.env["WECHAT_PAY_MERCHANT_MODE"] !== "direct_confirmed") throw new ServiceUnavailableException({ code: "wechat_merchant_unconfirmed", message: "微信商户模式尚未确认；普通商户配置须明确确认，服务商模式暂不可用" })
  if (process.env["WECHAT_PAY_ENABLED"] !== "true") throw new ServiceUnavailableException({ code: "wechat_pay_disabled", message: "微信资金接口尚未启用" })
  const notifyUrl = requiredWechatEnv("WECHAT_PAY_NOTIFY_URL")
  const refundNotifyUrl = requiredWechatEnv("WECHAT_PAY_REFUND_NOTIFY_URL")
  if (![notifyUrl, refundNotifyUrl].every(value => value.startsWith("https://"))) throw new ServiceUnavailableException("微信通知地址须为HTTPS")
  const apiV3Key = requiredWechatEnv("WECHAT_PAY_API_V3_KEY")
  if (Buffer.byteLength(apiV3Key) !== 32) throw new ServiceUnavailableException("微信API v3密钥长度不正确")
  return { appId: requiredWechatEnv("WECHAT_MINIAPP_APP_ID"), merchantId: requiredWechatEnv("WECHAT_PAY_MCH_ID"), serialNo: requiredWechatEnv("WECHAT_PAY_SERIAL_NO"), privateKey: readFileSync(requiredWechatEnv("WECHAT_PAY_PRIVATE_KEY_PATH"), "utf8"), publicKeyId: requiredWechatEnv("WECHAT_PAY_PUBLIC_KEY_ID"), publicKey: readFileSync(requiredWechatEnv("WECHAT_PAY_PUBLIC_KEY_PATH"), "utf8"), apiV3Key, notifyUrl, refundNotifyUrl, apiOrigin: "https://api.mch.weixin.qq.com" }
}
