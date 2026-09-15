import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { DOMAIN_POLICY_VERSION, TOUR_SESSION_STATUS } from "@linan/contracts"
import { createDomainDataSource } from "../src/domain/data-source.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]
const schemaEvidencePath = process.env["SCHEMA_MANUAL_EVIDENCE_PATH"]

describe.skipIf(databaseUrl === undefined)("Catalog schema contracts", () => {
  const dataSource = createDomainDataSource(databaseUrl ?? "")

  beforeAll(async () => {
    await dataSource.initialize()
    await dataSource.runMigrations()
  })

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  })

  it("keeps school catalog schema aligned with TypeORM metadata", async () => {
    const scope = randomUUID()
    const gradeId = `grade-${scope}`
    const classId = `class-${scope}`
    const organizationId = `org-${scope}`
    const catalogItemId = `catalog-${scope}`
    const sessionId = `session-${scope}`

    expect(dataSource.entityMetadatas.map(({ tableName }) => tableName)).toEqual(
      expect.arrayContaining(["organizations", "school_grades", "school_classes", "tour_sessions"]),
    )

    await dataSource.transaction(async (manager) => {
      await manager.query(
        "INSERT INTO organizations (id, code, name) VALUES (?, ?, ?)",
        [organizationId, `school-${scope}`, "Linan Test School"],
      )
      await manager.query(
        "INSERT INTO school_grades (id, organization_id, code, name) VALUES (?, ?, ?, ?)",
        [gradeId, organizationId, "grade-1", "Grade One"],
      )
      await manager.query(
        "INSERT INTO school_classes (id, grade_id, code, name) VALUES (?, ?, ?, ?)",
        [classId, gradeId, "class-1", "Class One"],
      )
      await manager.query(
        `
          INSERT INTO catalog_items (id, organization_id, code, title, status, policy_version)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [catalogItemId, organizationId, `catalog-${scope}`, "Qingshan Lake Study Tour", "active", DOMAIN_POLICY_VERSION],
      )
      await manager.query(
        `
          INSERT INTO tour_sessions (
            id,
            organization_id,
            catalog_item_id,
            code,
            status,
            price_fen,
            capacity,
            starts_at,
            ends_at,
            enrollment_opens_at,
            enrollment_closes_at,
            policy_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          sessionId,
          organizationId,
          catalogItemId,
          `session-${scope}`,
          TOUR_SESSION_STATUS.published,
          12_345,
          30,
          "2026-10-01 09:00:00.000000",
          "2026-10-01 17:00:00.000000",
          "2026-09-15 09:00:00.000000",
          "2026-09-30 17:00:00.000000",
          DOMAIN_POLICY_VERSION,
        ],
      )
    })

    await expect(
      dataSource.query("INSERT INTO school_grades (id, organization_id, code, name) VALUES (?, ?, ?, ?)", [
        `duplicate-grade-${scope}`,
        organizationId,
        "grade-1",
        "Duplicate Grade",
      ]),
    ).rejects.toThrow()
    await expect(
      dataSource.query("INSERT INTO school_classes (id, grade_id, code, name) VALUES (?, ?, ?, ?)", [
        `duplicate-class-${scope}`,
        gradeId,
        "class-1",
        "Duplicate Class",
      ]),
    ).rejects.toThrow()

    const schemaLog = await dataSource.driver.createSchemaBuilder().log()
    expect(schemaLog.upQueries).toHaveLength(0)
    expect(schemaLog.downQueries).toHaveLength(0)

    const tables = await dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('organizations','school_grades','school_classes','tour_sessions') ORDER BY table_name",
    )
    const columns = await dataSource.query(
      "SELECT table_name, column_name, column_type, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'school_grades') OR (table_name = 'school_classes') OR (table_name = 'tour_sessions' AND column_name IN ('enrollment_opens_at','enrollment_closes_at'))) ORDER BY table_name, ordinal_position",
    )
    const constraints = await dataSource.query(
      "SELECT constraint_name, table_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND constraint_name IN ('fk_school_grades_organization','fk_school_classes_grade','fk_tour_sessions_organization','fk_tour_sessions_catalog_item') ORDER BY table_name, constraint_name, ordinal_position",
    )
    const indexes = await dataSource.query(
      "SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_joined, non_unique FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('uq_school_grades_organization_code','uq_school_classes_grade_code','uq_tour_sessions_org_code','idx_tour_sessions_catalog_item') GROUP BY table_name, index_name, non_unique ORDER BY table_name, index_name",
    )
    const manualEvidence = {
      tables,
      columns,
      constraints,
      indexes,
      schemaBuilder: {
        up: schemaLog.upQueries.length,
        down: schemaLog.downQueries.length,
      },
      ok: tables.length === 4 && constraints.length === 4 && indexes.length === 4,
    }

    if (schemaEvidencePath !== undefined) {
      await writeFile(schemaEvidencePath, JSON.stringify(manualEvidence, null, 2), "utf8")
    }

    expect(manualEvidence.ok).toBe(true)
  })
})
