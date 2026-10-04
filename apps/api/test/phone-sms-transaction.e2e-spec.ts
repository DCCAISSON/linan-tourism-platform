import { randomUUID } from "node:crypto"
import { HttpException } from "@nestjs/common"
import { Test, type TestingModule } from "@nestjs/testing"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDomainDataSource } from "../src/domain/data-source.js"
import { PhoneSmsChallengeEntity } from "../src/domain/entities/index.js"
import { AddPhoneAuthentication1766020000000 } from "../src/migrations/1766020000000-AddPhoneAuthentication.js"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
import { PhoneAuthService } from "../src/modules/wechat/phone-auth.service.js"
import { hashPhone, hashSmsCode } from "../src/modules/wechat/wechat-session-token.js"
import { WechatAuthService, type PhoneLoginResponse } from "../src/modules/wechat/wechat-auth.service.js"

const databaseUrl = process.env["PHONE_AUTH_TEST_DATABASE_URL"]
const hmacKey = "phone-auth-e2e-hmac-key-for-isolated-mysql"

describe.skipIf(databaseUrl === undefined)("SMS attempts use committed MySQL transactions", () => {
  const source = createDomainDataSource(databaseUrl ?? "")
  const ids: string[] = []
  const verifiedLogins: { readonly loginCode: string; readonly phone: string }[] = []
  const migration = new AddPhoneAuthentication1766020000000()
  let moduleFixture: TestingModule
  let phoneAuth: PhoneAuthService

  beforeAll(async () => {
    process.env["PHONE_AUTH_HMAC_KEY"] = hmacKey
    await source.initialize()
    await source.query("CREATE TABLE wechat_family_sessions (id varchar(64) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
    const runner = source.createQueryRunner()
    await migration.up(runner)
    await runner.release()
    const wechat = {
      loginWithVerifiedPhone: async (loginCode: string, phone: string): Promise<PhoneLoginResponse> => {
        verifiedLogins.push({ loginCode, phone })
        return { token: "isolated-session-token", familyCode: "consumer-isolated", expiresAt: "2026-10-01T01:00:00.000Z", phoneVerified: true }
      },
    }
    moduleFixture = await Test.createTestingModule({
      providers: [PhoneAuthService, { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => source } }, { provide: WechatAuthService, useValue: wechat }],
    }).compile()
    phoneAuth = moduleFixture.get(PhoneAuthService)
  })

  afterAll(async () => {
    if (moduleFixture !== undefined) await moduleFixture.close()
    if (source.isInitialized) {
      if (ids.length > 0) await source.getRepository(PhoneSmsChallengeEntity).delete(ids)
      const runner = source.createQueryRunner()
      await migration.down(runner)
      await runner.release()
      await source.query("DROP TABLE wechat_family_sessions")
      await source.destroy()
    }
    delete process.env["PHONE_AUTH_HMAC_KEY"]
  })

  it("reproduces the previous save-then-throw rollback behavior", async () => {
    const id = await seedChallenge("13800001001", "123456")
    await expect(source.transaction(async (manager) => {
      const challenge = await manager.getRepository(PhoneSmsChallengeEntity).findOneByOrFail({ id })
      challenge.attemptCount += 1
      await manager.save(challenge)
      throw new Error("previous invalid-code branch threw inside the transaction")
    })).rejects.toThrow("previous invalid-code branch")
    expect((await source.getRepository(PhoneSmsChallengeEntity).findOneByOrFail({ id })).attemptCount).toBe(0)
  })

  it("creates the rate-bucket columns used by sendSms", async () => {
    const rows: readonly { readonly name: string }[] = await source.query("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'phone_sms_send_limits' ORDER BY ordinal_position")
    expect(rows.map((row) => row.name)).toEqual(["limit_key", "minute_started_at", "minute_count", "day_started_at", "day_count"])
  })

  it("commits five failed public service attempts before rejecting the sixth", async () => {
    const phone = "13800001002"
    const id = await seedChallenge(phone, "123456")
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectSmsError(() => phoneAuth.smsLogin({ loginCode: "login-code", phone, code: "000000" }), "sms_code_invalid")
    }
    expect((await source.getRepository(PhoneSmsChallengeEntity).findOneByOrFail({ id })).attemptCount).toBe(5)
    await expectSmsError(() => phoneAuth.smsLogin({ loginCode: "login-code", phone, code: "000000" }), "sms_code_attempts_exhausted")
    expect((await source.getRepository(PhoneSmsChallengeEntity).findOneByOrFail({ id })).attemptCount).toBe(5)
  })

  it("marks a correct code consumed before the public service rejects replay", async () => {
    const phone = "13800001003"
    const id = await seedChallenge(phone, "654321")
    await expect(phoneAuth.smsLogin({ loginCode: "accepted-login-code", phone, code: "654321" })).resolves.toMatchObject({ phoneVerified: true })
    expect((await source.getRepository(PhoneSmsChallengeEntity).findOneByOrFail({ id })).consumedAt).not.toBeNull()
    await expectSmsError(() => phoneAuth.smsLogin({ loginCode: "replay-login-code", phone, code: "654321" }), "sms_code_replayed")
    expect(verifiedLogins).toEqual([{ loginCode: "accepted-login-code", phone }])
  })

  async function seedChallenge(phone: string, code: string): Promise<string> {
    const id = `phone-sms-${randomUUID()}`
    ids.push(id)
    const phoneHash = hashPhone(phone)
    await source.getRepository(PhoneSmsChallengeEntity).save({ id, phoneHash, codeHash: hashSmsCode(phoneHash, code), attemptCount: 0, expiresAt: new Date(Date.now() + 60_000), consumedAt: null })
    return id
  }
})

async function expectSmsError(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action()
    throw new Error(`expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException)
    if (!(error instanceof HttpException)) return
    const response = error.getResponse()
    expect(typeof response).toBe("object")
    if (typeof response === "object" && response !== null) expect(response).toMatchObject({ code })
  }
}
