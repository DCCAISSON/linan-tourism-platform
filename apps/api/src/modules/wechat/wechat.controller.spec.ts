import { describe, expect, it } from "vitest"
import { smsRequestSource } from "./wechat.controller.js"

describe("smsRequestSource", () => {
  it("uses Nginx's single X-Real-IP only from the local proxy socket", () => {
    expect(smsRequestSource({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "203.0.113.11" } })).toBe("203.0.113.11")
    expect(smsRequestSource({ socket: { remoteAddress: "::ffff:127.0.0.1" }, headers: { "x-real-ip": "2001:db8::11" } })).toBe("2001:db8::11")
  })

  it("keeps two proxied users in distinct source buckets", () => {
    const first = smsRequestSource({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "203.0.113.12" } })
    const second = smsRequestSource({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "203.0.113.13" } })
    expect(first).not.toBe(second)
  })

  it("ignores spoofed, malformed, and multi-hop values", () => {
    expect(smsRequestSource({ socket: { remoteAddress: "198.51.100.1" }, headers: { "x-real-ip": "203.0.113.14" } })).toBe("198.51.100.1")
    expect(smsRequestSource({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "203.0.113.14, 198.51.100.2" } })).toBe("127.0.0.1")
    expect(smsRequestSource({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "not-an-ip" } })).toBe("127.0.0.1")
  })
})
