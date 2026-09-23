import type { INestApplication } from "@nestjs/common"
import { Test, type TestingModule } from "@nestjs/testing"
import request from "supertest"
import { DataSource, type QueryRunner } from "typeorm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { AuditLogEntity, OrganizationEntity } from "../src/domain/entities/index.js"
import { CrmCustomerEntity } from "../src/domain/entities/crm-customer.entity.js"
import { CrmFollowupEntity } from "../src/domain/entities/crm-followup.entity.js"
import { AddCrm1765962000000 } from "../src/migrations/1765962000000-AddCrm.js"
import { CrmModule } from "../src/modules/crm/crm.module.js"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]
const DEV_ADMIN_HEADERS = { "x-linan-dev-staff-id": "dev-admin", "x-linan-dev-staff-role": "administrator" } as const

function createScope(): string {
  return Math.random().toString(36).slice(2, 10)
}

function requireDatabaseUrl(): string {
  if (databaseUrl === undefined) {
    throw new Error("DOMAIN_TEST_DATABASE_URL is required for CRM staff API tests")
  }
  return databaseUrl
}


async function prepareCrmE2eSchema(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner()
  await queryRunner.connect()
  try {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS organizations (
      id varchar(64) NOT NULL, code varchar(64) NOT NULL, name varchar(120) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY(id), UNIQUE KEY uq_organizations_code(code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id varchar(64) NOT NULL, organization_id varchar(64) NOT NULL, actor_id varchar(64) NOT NULL,
      action varchar(120) NOT NULL, target_type varchar(120) NOT NULL, target_id varchar(128) NOT NULL,
      metadata json NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY(id), KEY idx_audit_logs_org_created(organization_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await recreateCrmTables(queryRunner)
  } finally {
    await queryRunner.release()
  }
}

async function recreateCrmTables(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query("DROP TABLE IF EXISTS crm_followups")
  await queryRunner.query("DROP TABLE IF EXISTS crm_customers")
  await new AddCrm1765962000000().up(queryRunner)
}

describe.skipIf(databaseUrl === undefined)("CRM staff API", () => {
  let app: INestApplication
  let scope: string
  let organizationId: string
  let previousPersonDataKey: string | undefined
  let crmDataSource: DataSource

  beforeAll(async () => {
    previousPersonDataKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 25).toString("base64")
    crmDataSource = new DataSource({
      type: "mysql",
      charset: "utf8mb4",
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: "typeorm_migrations",
      entities: [AuditLogEntity, OrganizationEntity, CrmCustomerEntity, CrmFollowupEntity],
      url: requireDatabaseUrl(),
    })
    await crmDataSource.initialize()
    await prepareCrmE2eSchema(crmDataSource)
  })

  beforeEach(async () => {
    scope = createScope()
    organizationId = `school-${scope}`
    await crmDataSource.manager.save(OrganizationEntity, { id: organizationId, code: organizationId, name: "CRM娴嬭瘯瀛︽牎" })
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [CrmModule] })
      .overrideProvider(ConfigurationDatabaseService)
      .useValue({ getDataSource: async () => crmDataSource })
      .compile()
    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app.close()
    await crmDataSource.query("delete followup from crm_followups followup join crm_customers customer on customer.id = followup.customer_id where customer.organization_id = ?", [organizationId])
    await crmDataSource.query("delete from crm_customers where organization_id = ?", [organizationId])
    await crmDataSource.query("delete from audit_logs where organization_id = ?", [organizationId])
    await crmDataSource.query("delete from organizations where id = ?", [organizationId])
  })

  afterAll(async () => {
    if (crmDataSource.isInitialized) {
      await crmDataSource.query("DROP TABLE IF EXISTS crm_followups")
      await crmDataSource.query("DROP TABLE IF EXISTS crm_customers")
      await crmDataSource.destroy()
    }
    if (previousPersonDataKey === undefined) {
      delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
      return
    }
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousPersonDataKey
  })

  it("creates an adult customer, records followup idempotently, filters, exports masked rows, and audits plaintext contact reads", async () => {
    const customer = await request(app.getHttpServer())
      .post("/staff/crm/contacts")
      .set(DEV_ADMIN_HEADERS)
      .send({
        organizationId,
        displayName: "CRM Adult Customer",
        birthDate: "1990-01-01",
        adultConfirmed: true,
        phone: "13800000000",
        source: "manual source",
        tags: ["family-trip"],
        marketingConsent: "unknown",
        ownerId: null,
        familyId: null,
        idempotencyKey: `create-${scope}`,
      })
      .expect(201)

    await request(app.getHttpServer())
      .post(`/staff/crm/contacts/${customer.body.id}/followups`)
      .set(DEV_ADMIN_HEADERS)
      .send({ content: "phone confirmed adult customer", nextFollowupAt: null, idempotencyKey: `follow-${scope}` })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/staff/crm/contacts/${customer.body.id}/followups`)
      .set(DEV_ADMIN_HEADERS)
      .send({ content: "phone confirmed adult customer", nextFollowupAt: null, idempotencyKey: `follow-${scope}` })
      .expect(201)

    const list = await request(app.getHttpServer())
      .get("/staff/crm/contacts")
      .set(DEV_ADMIN_HEADERS)
      .query({ organizationId, tag: "family-trip" })
      .expect(200)
    const detail = await request(app.getHttpServer()).get(`/staff/crm/contacts/${customer.body.id}`).set(DEV_ADMIN_HEADERS).expect(200)
    const contact = await request(app.getHttpServer()).get(`/staff/crm/contacts/${customer.body.id}/contact`).set(DEV_ADMIN_HEADERS).query({ reason: "callback" }).expect(200)
    const exportResponse = await request(app.getHttpServer()).get("/staff/crm/export.csv").set(DEV_ADMIN_HEADERS).query({ organizationId }).expect(200)

    const followupRows = await crmDataSource.query("select id from crm_followups where customer_id = ?", [customer.body.id])
    const audits = await crmDataSource.manager.find(AuditLogEntity, { where: { organizationId }, order: { createdAt: "ASC" } })
    expect(list.body.total).toBe(1)
    expect(detail.body.followups).toHaveLength(1)
    expect(contact.body.phone).toBe("13800000000")
    expect(exportResponse.text).toContain("138****0000")
    expect(exportResponse.text).not.toContain("13800000000")
    expect(followupRows).toHaveLength(1)
    expect(audits.map(row => row.action)).toEqual(expect.arrayContaining(["crm.contact.read", "crm.export.masked"]))
  })

  it("rejects minors, health-field injection, and cross-organization access", async () => {
    await request(app.getHttpServer())
      .post("/staff/crm/contacts")
      .set(DEV_ADMIN_HEADERS)
      .send({
        organizationId,
        displayName: "Minor Customer",
        birthDate: "2015-01-01",
        adultConfirmed: true,
        phone: "13800000000",
        source: "manual source",
        tags: [],
        marketingConsent: "unknown",
        ownerId: null,
        familyId: null,
        idempotencyKey: `minor-${scope}`,
      })
      .expect(400)
    await request(app.getHttpServer())
      .post("/staff/crm/contacts")
      .set(DEV_ADMIN_HEADERS)
      .send({
        organizationId,
        displayName: "Health Field Injection",
        birthDate: "1990-01-01",
        adultConfirmed: true,
        phone: "13800000000",
        source: "manual source",
        tags: [],
        marketingConsent: "unknown",
        ownerId: null,
        familyId: null,
        idempotencyKey: `health-${scope}`,
        health: "涓嶅簲杩涘叆CRM",
      })
      .expect(400)
    await request(app.getHttpServer())
      .get("/staff/crm/contacts")
      .set({ "x-linan-dev-staff-id": "dev-school", "x-linan-dev-staff-role": "school", "x-linan-dev-staff-school-id": `other-${scope}` })
      .query({ organizationId })
      .expect(403)
  })
})
