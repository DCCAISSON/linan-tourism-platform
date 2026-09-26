import { DOMAIN_POLICY_VERSION } from "@linan/contracts"
import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDomainDataSource, DOMAIN_DATA_SOURCE_OPTIONS } from "../src/domain/data-source.js"
import { FamilyEntity, OrganizationEntity, WechatFamilySessionEntity, WechatIdentityEntity } from "../src/domain/entities/index.js"
import { hashWechatIdentity } from "../src/modules/wechat/wechat-session-token.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]

describe.skipIf(databaseUrl === undefined)("WeChat historical identity migration", () => {
  const admin = createDomainDataSource(databaseUrl ?? "")
  const databaseName = `wechat_migration_${randomUUID().replaceAll("-", "")}`
  const url = new URL(databaseUrl ?? "mysql://localhost/unused")
  url.pathname = `/${databaseName}`
  const target = createDomainDataSource(url.toString())

  beforeEach(async () => {
    await admin.initialize()
    await admin.query(`CREATE DATABASE ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    target.setOptions({ migrations: DOMAIN_DATA_SOURCE_OPTIONS.migrations.filter((migration) => migration.name !== "AddWechatIdentities1765980000000" && migration.name !== "AddEnrollmentContactAndCommonMembers1765983600000") })
    await target.initialize()
    await target.runMigrations()
    await target.destroy()
    target.setOptions({ migrations: DOMAIN_DATA_SOURCE_OPTIONS.migrations })
    await target.initialize()
    await target.getRepository(OrganizationEntity).save({ id: "legacy-school", code: "legacy-school", name: "Legacy school" })
    await target.getRepository(FamilyEntity).save([
      { id: "legacy-family", organizationId: "legacy-school", code: "legacy-code", primaryContactName: "Legacy parent", policyVersion: DOMAIN_POLICY_VERSION },
      { id: "other-family", organizationId: "legacy-school", code: "other-code", primaryContactName: "Other parent", policyVersion: DOMAIN_POLICY_VERSION },
    ])
  })
  afterEach(async () => {
    if (target.isInitialized) await target.destroy()
    if (admin.isInitialized) { await admin.query(`DROP DATABASE ${databaseName}`); await admin.destroy() }
  })

  async function seedSession(openid: string, familyId: string, familyCode: string) {
    await target.getRepository(WechatFamilySessionEntity).save({
      id: randomUUID(), organizationId: "legacy-school", familyId, familyCode,
      openidHash: hashWechatIdentity(openid), tokenHash: hashWechatIdentity(randomUUID()),
      expiresAt: new Date("2000-01-01"), revokedAt: new Date("2000-01-01"),
    })
  }

  it("preserves the family when all historical sessions have expired and been revoked", async () => {
    await seedSession("legacy-openid", "legacy-family", "legacy-code")
    await seedSession("legacy-openid", "legacy-family", "legacy-code")

    await target.runMigrations()

    expect(await target.getRepository(WechatIdentityEntity).find()).toEqual([
      expect.objectContaining({ openidHash: hashWechatIdentity("legacy-openid"), familyCode: "legacy-code" }),
    ])
    expect(await target.getRepository(WechatFamilySessionEntity).count()).toBe(2)
  })

  it("refuses migration when one historical identity has conflicting families", async () => {
    await seedSession("legacy-openid", "legacy-family", "legacy-code")
    await seedSession("legacy-openid", "other-family", "other-code")

    await expect(target.runMigrations()).rejects.toThrow("1 conflicting historical mappings")

    expect(await target.getRepository(WechatFamilySessionEntity).count()).toBe(2)
  })

  it("refuses migration when multiple historical identities share a family", async () => {
    await seedSession("legacy-openid", "legacy-family", "legacy-code")
    await seedSession("other-openid", "legacy-family", "legacy-code")

    await expect(target.runMigrations()).rejects.toThrow("1 conflicting historical mappings")

    expect(await target.getRepository(WechatFamilySessionEntity).count()).toBe(2)
  })
})
