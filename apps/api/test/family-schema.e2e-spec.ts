import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import {
  DOMAIN_POLICY_VERSION,
  DOMAIN_SCHEMA_VERSION,
  ENROLLMENT_STATUS,
  TOUR_SESSION_STATUS,
} from "@linan/contracts"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDomainDataSource } from "../src/domain/data-source.js"
import { EnrollmentParticipantEntity, FamilyEntity, FamilyMemberEntity } from "../src/domain/entities/index.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]
const schemaEvidencePath = process.env["FAMILY_SCHEMA_EVIDENCE_PATH"]
const shouldCycleMigration = process.env["FAMILY_SCHEMA_CYCLE_MIGRATION"] === "1"
type Statement = {
  readonly sql: string
  readonly params: readonly unknown[]
}
describe.skipIf(databaseUrl === undefined)("Family enrollment schema contracts", () => {
  const dataSource = createDomainDataSource(databaseUrl ?? "")
  beforeAll(async () => {
    await dataSource.initialize()
  })
  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  })
  it("keeps family enrollment schema aligned with TypeORM metadata", async () => {
    const migrated = await dataSource.runMigrations()
    if (shouldCycleMigration) {
      expect(migrated.map(({ name }) => name)).toContain("AddFamilyEnrollmentSchema1765904400000")
      await dataSource.undoLastMigration()
      const rerun = await dataSource.runMigrations()
      expect(rerun.map(({ name }) => name)).toEqual(["AddFamilyEnrollmentSchema1765904400000"])
    }
    const scope = randomUUID()
    const ids = {
      organization: `org-family-${scope}`,
      grade: `grade-family-${scope}`,
      class: `class-family-${scope}`,
      family: `family-${scope}`,
      member: `member-${scope}`,
      catalog: `catalog-family-${scope}`,
      session: `session-family-${scope}`,
      enrollment: `enrollment-family-${scope}`,
      participant: `participant-${scope}`,
      consent: `consent-family-${scope}`,
    } as const
    expect(dataSource.hasMetadata(FamilyEntity)).toBe(true)
    expect(dataSource.hasMetadata(FamilyMemberEntity)).toBe(true)
    expect(dataSource.hasMetadata(EnrollmentParticipantEntity)).toBe(true)

    const insertStatements: readonly Statement[] = [
      {
        sql: "INSERT INTO organizations (id, code, name) VALUES (?, ?, ?)",
        params: [ids.organization, `school-family-${scope}`, "Linan Test School"],
      },
      {
        sql: "INSERT INTO school_grades (id, organization_id, code, name) VALUES (?, ?, ?, ?)",
        params: [ids.grade, ids.organization, "grade-family-1", "Grade One"],
      },
      {
        sql: "INSERT INTO school_classes (id, grade_id, code, name) VALUES (?, ?, ?, ?)",
        params: [ids.class, ids.grade, "class-family-1", "Class One"],
      },
      {
        sql: "INSERT INTO families (id, organization_id, code, primary_contact_name, policy_version) VALUES (?, ?, ?, ?, ?)",
        params: [ids.family, ids.organization, `family-${scope}`, "Guardian Contact", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO family_members (id, organization_id, family_id, code, display_name, grade_id, class_id, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          ids.member,
          ids.organization,
          ids.family,
          `member-${scope}`,
          "Participant Snapshot Source",
          ids.grade,
          ids.class,
          DOMAIN_POLICY_VERSION,
        ],
      },
      {
        sql: "INSERT INTO catalog_items (id, organization_id, code, title, status, policy_version) VALUES (?, ?, ?, ?, ?, ?)",
        params: [
          ids.catalog,
          ids.organization,
          `catalog-family-${scope}`,
          "Qingshan Lake Study Tour",
          "active",
          DOMAIN_POLICY_VERSION,
        ],
      },
      {
        sql: "INSERT INTO tour_sessions (id, organization_id, catalog_item_id, code, status, price_fen, capacity, starts_at, ends_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          ids.session,
          ids.organization,
          ids.catalog,
          `session-family-${scope}`,
          TOUR_SESSION_STATUS.published,
          12_345,
          30,
          "2026-10-01 09:00:00.000000",
          "2026-10-01 17:00:00.000000",
          DOMAIN_POLICY_VERSION,
        ],
      },
      {
        sql: "INSERT INTO enrollments (id, organization_id, tour_session_id, family_id, code, contact_name, emergency_contact_name, emergency_contact_phone, participant_count, status, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          ids.enrollment,
          ids.organization,
          ids.session,
          ids.family,
          `enrollment-family-${scope}`,
          "Guardian Contact",
          "Emergency Contact",
          "13800000000",
          1,
          ENROLLMENT_STATUS.confirmed,
          DOMAIN_POLICY_VERSION,
        ],
      },
      {
        sql: "INSERT INTO enrollment_participants (id, organization_id, enrollment_id, family_id, family_member_id, display_name_snapshot, grade_name_snapshot, class_name_snapshot, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          ids.participant,
          ids.organization,
          ids.enrollment,
          ids.family,
          ids.member,
          "Participant Snapshot",
          "Grade One",
          "Class One",
          DOMAIN_POLICY_VERSION,
        ],
      },
      {
        sql: "INSERT INTO consent_records (id, organization_id, family_id, subject_id, purpose, granted, agreement_version, schema_version, accepted_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          ids.consent,
          ids.organization,
          ids.family,
          ids.enrollment,
          "guardian_enrollment",
          true,
          "agreement-v1",
          DOMAIN_SCHEMA_VERSION,
          "2026-09-15 09:00:00.000000",
          DOMAIN_POLICY_VERSION,
        ],
      },
    ]
    for (const statement of insertStatements) {
      await dataSource.query(statement.sql, statement.params)
    }
    const duplicateStatements: readonly Statement[] = [
      {
        sql: "INSERT INTO families (id, organization_id, code, primary_contact_name, policy_version) VALUES (?, ?, ?, ?, ?)",
        params: [`duplicate-family-${scope}`, ids.organization, `family-${scope}`, "Duplicate", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO family_members (id, organization_id, family_id, code, display_name, policy_version) VALUES (?, ?, ?, ?, ?, ?)",
        params: [
          `duplicate-member-${scope}`,
          ids.organization,
          ids.family,
          `member-${scope}`,
          "Duplicate",
          DOMAIN_POLICY_VERSION,
        ],
      },
      {
        sql: "INSERT INTO enrollment_participants (id, organization_id, enrollment_id, family_id, family_member_id, display_name_snapshot, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [
          `duplicate-participant-${scope}`,
          ids.organization,
          ids.enrollment,
          ids.family,
          ids.member,
          "Duplicate",
          DOMAIN_POLICY_VERSION,
        ],
      },
    ]
    for (const statement of duplicateStatements) {
      await expect(dataSource.query(statement.sql, statement.params)).rejects.toThrow()
    }
    const storedRows = await dataSource.query(
      "SELECT f.primary_contact_name, fm.grade_id, fm.class_id, e.family_id, e.emergency_contact_name, e.emergency_contact_phone, ep.display_name_snapshot, ep.grade_name_snapshot, ep.class_name_snapshot, c.family_id AS consent_family_id FROM families f JOIN family_members fm ON fm.family_id = f.id JOIN enrollments e ON e.family_id = f.id JOIN enrollment_participants ep ON ep.enrollment_id = e.id JOIN consent_records c ON c.subject_id = e.id WHERE f.id = ?",
      [ids.family],
    )
    expect(storedRows).toEqual([
      expect.objectContaining({
        primary_contact_name: "Guardian Contact",
        grade_id: ids.grade,
        class_id: ids.class,
        family_id: ids.family,
        emergency_contact_name: "Emergency Contact",
        emergency_contact_phone: "13800000000",
        display_name_snapshot: "Participant Snapshot",
        grade_name_snapshot: "Grade One",
        class_name_snapshot: "Class One",
        consent_family_id: ids.family,
      }),
    ])
    const schemaLog = await dataSource.driver.createSchemaBuilder().log()
    expect(schemaLog.upQueries).toHaveLength(0)
    expect(schemaLog.downQueries).toHaveLength(0)

    const tables = await dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('families','family_members','enrollments','enrollment_participants','consent_records') ORDER BY table_name",
    )
    const columns = await dataSource.query(
      "SELECT table_name, column_name, column_type, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name IN ('families','family_members','enrollment_participants')) OR (table_name = 'enrollments' AND column_name IN ('family_id','emergency_contact_name','emergency_contact_phone')) OR (table_name = 'consent_records' AND column_name = 'family_id')) ORDER BY table_name, ordinal_position",
    )
    const constraints = await dataSource.query(
      "SELECT constraint_name, table_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND constraint_name IN ('fk_families_organization','fk_family_members_organization','fk_family_members_family','fk_family_members_grade','fk_family_members_class','fk_enrollments_family','fk_enrollment_participants_organization','fk_enrollment_participants_enrollment','fk_enrollment_participants_family','fk_enrollment_participants_family_member','fk_consent_records_family') ORDER BY table_name, constraint_name, ordinal_position",
    )
    const indexes = await dataSource.query(
      "SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_joined, non_unique FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('uq_families_organization_code','uq_family_members_family_code','idx_enrollments_family','uq_enrollment_participants_enrollment_member','idx_enrollment_participants_family','idx_consent_records_family') GROUP BY table_name, index_name, non_unique ORDER BY table_name, index_name",
    )
    const manualEvidence = {
      migrations: {
        firstRun: migrated.map(({ name }) => name),
        cycled: shouldCycleMigration,
      },
      tables,
      columns,
      constraints,
      indexes,
      schemaBuilder: { up: schemaLog.upQueries.length, down: schemaLog.downQueries.length },
      ok: tables.length === 5 && constraints.length === 11 && indexes.length === 6,
    }

    if (schemaEvidencePath !== undefined) {
      await writeFile(schemaEvidencePath, JSON.stringify(manualEvidence, null, 2), "utf8")
    }

    expect(manualEvidence.ok).toBe(true)
  }, 30_000)
})
