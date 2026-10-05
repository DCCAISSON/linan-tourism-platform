import "reflect-metadata"
import { get } from "node:http"
import { Controller, Get, HttpException, Param, Post, Req, Res, UnauthorizedException, type INestApplication, type RawBodyRequest } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import type { Request, Response } from "express"
import request from "supertest"
import { QueryFailedError } from "typeorm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installRequestObservability, recordRequestActor } from "./request-observability.js"

const secret = "synthetic-private-value"
let releaseFirst: (() => void) | undefined
let firstEntered: (() => void) | undefined
let firstRequestEntered = Promise.resolve()
let secondRequestEntered = Promise.resolve()

@Controller()
class RequestFixtureController {
  @Get("fixtures/people/:id")
  person() { return { ok: true } }

  @Get("fixtures/unauthorized")
  unauthorized() { throw new UnauthorizedException({ code: "identity_required", message: "请先登录" }) }

  @Get("fixtures/limited")
  limited() { throw new HttpException({ code: "sms_rate_limited", message: "短信发送过于频繁" }, 429) }

  @Get("fixtures/failure")
  failure() { throw new QueryFailedError("SELECT private_value", [secret], new Error(secret)) }

  @Get("fixtures/actor/:id")
  async actor(@Param("id") id: string) {
    recordRequestActor(id)
    if (id === "first") {
      firstEntered?.()
      await secondRequestEntered
    } else {
      await firstRequestEntered
      releaseFirst?.()
    }
    return { ok: true }
  }

  @Get("fixtures/stream")
  stream(@Res() response: Response) { response.write("ready") }

  @Post(["wechat/payments/callback", "wechat/refunds/callback"])
  callback(@Req() input: RawBodyRequest<Request>) { return { received: input.rawBody?.toString("utf8") } }
}

describe("request observability over HTTP", () => {
  let app: INestApplication
  let output: string[]

  beforeEach(async () => {
    output = []
    vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output.push(String(chunk)); return true })
    vi.spyOn(process.stderr, "write").mockImplementation(chunk => { output.push(String(chunk)); return true })
    const fixture = await Test.createTestingModule({ controllers: [RequestFixtureController] }).compile()
    app = fixture.createNestApplication({ rawBody: true, logger: ["error"] })
    installRequestObservability(app)
    await app.init()
  })

  afterEach(async () => {
    await app.close()
    vi.restoreAllMocks()
    releaseFirst = undefined
    firstEntered = undefined
  })

  it("records a server ID and route template when a request finishes without retaining private inputs", async () => {
    // Given private data in all user-controlled HTTP surfaces.
    const response = await request(app.getHttpServer()).get(`/fixtures/people/${secret}?phone=${secret}`)
      .set("Authorization", `Bearer ${secret}`).set("Cookie", `session=${secret}`).set("X-Request-Id", secret).expect(200)
    // Then only the safe completion fields are emitted.
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/)
    expect(logs(output)).toEqual([expect.objectContaining({ requestId: response.headers["x-request-id"], actorId: null, method: "GET", route: "/fixtures/people/:id", status: 200, durationMs: expect.any(Number) })])
    expect(output.join("")).not.toContain(secret)
  })

  it("preserves business response codes and records 401 when authentication fails", async () => {
    // Given an existing authentication error contract.
    const response = await request(app.getHttpServer()).get("/fixtures/unauthorized").expect(401)
    // Then no anonymous identity is invented.
    expect(response.body).toEqual({ code: "identity_required", message: "请先登录" })
    expect(logs(output)).toEqual([expect.objectContaining({ actorId: null, status: 401 })])
  })

  it("preserves the existing rate-limit response when a business handler rejects an attempt", async () => {
    // Given an existing business 429 error.
    const response = await request(app.getHttpServer()).get("/fixtures/limited").expect(429)
    // Then its status and response are unchanged.
    expect(response.body).toEqual({ code: "sms_rate_limited", message: "短信发送过于频繁" })
    expect(logs(output)).toEqual([expect.objectContaining({ status: 429 })])
  })

  it("records unmatched instead of the private path when no route exists", async () => {
    // Given a private value in an unknown path.
    await request(app.getHttpServer()).get(`/${secret}?token=${secret}`).expect(404)
    // Then access logs do not reproduce that URL.
    expect(logs(output)).toEqual([expect.objectContaining({ route: "unmatched", status: 404 })])
    expect(output.join("")).not.toContain(secret)
  })

  it("returns the default 500 without emitting SQL or driver values when an unknown error escapes", async () => {
    // Given an unexpected database exception containing private values.
    const response = await request(app.getHttpServer()).get("/fixtures/failure").expect(500)
    // Then the same generic response is returned and only safe request metadata is logged.
    expect(response.body).toEqual({ statusCode: 500, message: "Internal server error" })
    expect(output.join("")).not.toContain(secret)
    expect(output.join("")).not.toContain("SELECT private_value")
    expect(logs(output)).toEqual([expect.objectContaining({ status: 500 })])
  })

  it("keeps actor IDs separate when authenticated requests overlap", async () => {
    // Given two requests forced to overlap without timing assumptions.
    firstRequestEntered = new Promise(resolve => { firstEntered = resolve })
    secondRequestEntered = new Promise(resolve => { releaseFirst = resolve })
    // When both pass authentication before completing.
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).get("/fixtures/actor/first").expect(200),
      request(app.getHttpServer()).get("/fixtures/actor/second").expect(200),
    ])
    // Then each completion retains its own verified actor.
    expect(logs(output)).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId: first.headers["x-request-id"], actorId: "first" }),
      expect.objectContaining({ requestId: second.headers["x-request-id"], actorId: "second" }),
    ]))
    expect(logs(output)).toHaveLength(2)
  })

  it.each(["payments", "refunds"])("preserves %s callback raw bytes and response status without logging the body", async kind => {
    // Given signed JSON bytes whose whitespace must remain unchanged.
    const rawBody = `{ "ciphertext": "${secret}" }`
    // When the raw-body route receives the callback.
    const response = await request(app.getHttpServer()).post(`/wechat/${kind}/callback`).set("Content-Type", "application/json").send(rawBody).expect(201)
    // Then logging does not consume or rewrite the original bytes.
    expect(response.body).toEqual({ received: rawBody })
    expect(logs(output)).toEqual([expect.objectContaining({ route: `/wechat/${kind}/callback`, status: 201, actorId: null })])
    expect(output.join("")).not.toContain(secret)
  })

  it.each(["payments", "refunds"])("records the fixed %s callback route when malformed JSON is rejected before routing", async kind => {
    const route = `/wechat/${kind}/callback`
    const response = await request(app.getHttpServer()).post(`${route}?token=${secret}`).set("Content-Type", "application/json").send(`{${secret}`).expect(400)
    expect(response.body).toMatchObject({ statusCode: 400 })
    expect(logs(output)).toEqual([expect.objectContaining({ route, status: 400, actorId: null })])
    expect(output.join("")).not.toContain(secret)
  })

  it.each(["payments", "refunds"])("records the fixed %s callback route when the existing body-size limit rejects a request", async kind => {
    const route = `/wechat/${kind}/callback`
    const response = await request(app.getHttpServer()).post(`${route}?phone=${secret}`).send({ value: "x".repeat(110_000), token: secret }).expect(413)
    expect(response.body).toEqual({ statusCode: 413, message: "request entity too large" })
    expect(logs(output)).toEqual([expect.objectContaining({ route, status: 413, actorId: null })])
    expect(output.join("")).not.toContain(secret)
  })

  it("keeps a callback-like private path unmatched when parsing fails before routing", async () => {
    await request(app.getHttpServer()).post(`/wechat/payments/callback/${secret}?token=${secret}`).set("Content-Type", "application/json").send(`{${secret}`).expect(400)
    expect(logs(output)).toEqual([expect.objectContaining({ route: "unmatched", status: 400 })])
    expect(output.join("")).not.toContain(secret)
  })

  it("records an aborted request without a success status when the client disconnects", async () => {
    await app.listen(0, "127.0.0.1")
    const closed = new Promise<void>(resolve => {
      vi.mocked(process.stdout.write).mockImplementation(chunk => {
        const line = String(chunk)
        output.push(line)
        if (line.includes('"aborted":true')) resolve()
        return true
      })
    })
    const client = get(`${await app.getUrl()}/fixtures/stream`, response => {
      response.once("data", () => response.destroy())
    })
    try {
      await closed
      expect(logs(output)).toEqual([expect.objectContaining({ route: "/fixtures/stream", status: null, aborted: true })])
    } finally { client.destroy() }
  })
})

function logs(output: readonly string[]): readonly unknown[] {
  return output.filter(line => line.startsWith("{")).map(line => JSON.parse(line))
}
