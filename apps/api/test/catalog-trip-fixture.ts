import type { INestApplication } from "@nestjs/common"
import { Test, type TestingModule } from "@nestjs/testing"
import { randomUUID } from "node:crypto"
import { AppModule } from "../src/app.module.js"
import { createDomainDataSource } from "../src/domain/data-source.js"

export const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]
export const dataSource = createDomainDataSource(databaseUrl ?? "")
export const DEV_ADMIN_HEADERS = {
  "x-linan-dev-staff-id": "dev-admin",
  "x-linan-dev-staff-role": "administrator",
} as const

if (databaseUrl !== undefined) {
  process.env["DATABASE_URL"] = databaseUrl
}

export async function initializeCatalogTripDatabase(): Promise<void> {
  await dataSource.initialize()
  await dataSource.runMigrations()
}

export async function closeCatalogTripDatabase(): Promise<void> {
  if (dataSource.isInitialized) {
    await dataSource.destroy()
  }
}

export async function createCatalogTripApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  const app = moduleFixture.createNestApplication()
  await app.init()
  return app
}

export async function resetCatalogTripData(scope: string): Promise<void> {
  await dataSource.query("delete from tour_sessions where code like ?", [`session-${scope}%`])
  await dataSource.query("delete from catalog_items where code like ?", [`catalog-${scope}%`])
  await dataSource.query("delete from school_classes where code like ?", [`class-${scope}%`])
  await dataSource.query("delete from school_grades where code like ?", [`grade-${scope}%`])
  await dataSource.query("delete from organizations where code like ?", [`school-${scope}%`])
}

export function createScope(): string {
  return `catalog-trip-${randomUUID()}`
}
