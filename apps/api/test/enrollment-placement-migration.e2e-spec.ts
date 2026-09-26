import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDomainDataSource } from "../src/domain/data-source.js"
import { AddEnrollmentPlacementSnapshot1765987200000 } from "../src/migrations/1765987200000-AddEnrollmentPlacementSnapshot.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]

describe.skipIf(databaseUrl === undefined)("Enrollment placement additive migration", () => {
  const admin = createDomainDataSource(databaseUrl ?? "")
  const databaseName = `placement_migration_${randomUUID().replaceAll("-", "")}`
  const url = new URL(databaseUrl ?? "mysql://localhost/unused")
  url.pathname = `/${databaseName}`
  const target = createDomainDataSource(url.toString())
  beforeAll(async () => {
    await admin.initialize()
    await admin.query(`CREATE DATABASE ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await target.initialize()
    await target.query("CREATE TABLE enrollment_participants (id varchar(64) PRIMARY KEY, grade_name_snapshot varchar(120), class_name_snapshot varchar(120))")
  })
  afterAll(async () => {
    if (target.isInitialized) await target.destroy()
    if (admin.isInitialized) {
      await admin.query(`DROP DATABASE ${databaseName}`)
      await admin.destroy()
    }
  })
  it("retains old names without inventing historical placement IDs through up and down", async () => {
    // Given
    await target.query("INSERT INTO enrollment_participants VALUES ('legacy', 'Historical grade', 'Historical class')")
    const migration = new AddEnrollmentPlacementSnapshot1765987200000()
    const runner = target.createQueryRunner()
    await runner.connect()
    try {
      // When
      await migration.up(runner)
      // Then
      expect(await runner.query("SELECT * FROM enrollment_participants")).toEqual([{
        id: "legacy", grade_name_snapshot: "Historical grade", class_name_snapshot: "Historical class",
        grade_id_snapshot: null, class_id_snapshot: null,
      }])
      await migration.down(runner)
      expect(await runner.query("SELECT * FROM enrollment_participants")).toEqual([{
        id: "legacy", grade_name_snapshot: "Historical grade", class_name_snapshot: "Historical class",
      }])
    } finally {
      await runner.release()
    }
  })
})
