import type { INestApplication } from "@nestjs/common"
import { Test, type TestingModule } from "@nestjs/testing"
import request from "supertest"
import { afterEach, beforeEach, describe, it } from "vitest"
import { AppModule } from "../src/app.module.js"

describe("Health endpoint", () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it("returns ok when the API is running without database access", async () => {
    await request(app.getHttpServer()).get("/health").expect(200).expect({
      status: "ok",
      service: "@linan/api",
      revision: "local",
    })
  })
})
