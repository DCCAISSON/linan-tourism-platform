import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import {
  DOMAIN_POLICY_VERSION,
  ENROLLMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  ROSTER_STATUS,
  TOUR_SESSION_STATUS,
} from "@linan/contracts"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDomainDataSource } from "../src/domain/data-source.js"
import { OrderLineEntity, PaymentEventEntity } from "../src/domain/entities/index.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]
const schemaEvidencePath = process.env["ORDER_PAYMENT_SCHEMA_EVIDENCE_PATH"]
const shouldCycleMigration = process.env["ORDER_PAYMENT_SCHEMA_CYCLE_MIGRATION"] === "1"
type Statement = { readonly sql: string; readonly params: readonly unknown[] }

describe.skipIf(databaseUrl === undefined)("Order payment schema contracts", () => {
  const dataSource = createDomainDataSource(databaseUrl ?? "")

  beforeAll(async () => {
    await dataSource.initialize()
  })

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  })

  it("persists participant order lines payment events and roster ownership", async () => {
    const migrated = await dataSource.runMigrations()
    if (shouldCycleMigration) {
      expect(migrated.map(({ name }) => name)).toContain("AddOrderPaymentSchema1765908000000")
      await dataSource.undoLastMigration()
      const rerun = await dataSource.runMigrations()
      expect(rerun.map(({ name }) => name)).toEqual(["AddOrderPaymentSchema1765908000000"])
    }

    expect(dataSource.hasMetadata(OrderLineEntity)).toBe(true)
    expect(dataSource.hasMetadata(PaymentEventEntity)).toBe(true)

    const scope = randomUUID()
    const ids = {
      organization: `org-order-${scope}`,
      family: `family-order-${scope}`,
      memberOne: `member-order-one-${scope}`,
      memberTwo: `member-order-two-${scope}`,
      catalog: `catalog-order-${scope}`,
      session: `session-order-${scope}`,
      enrollment: `enrollment-order-${scope}`,
      participantOne: `participant-order-one-${scope}`,
      participantTwo: `participant-order-two-${scope}`,
      order: `order-${scope}`,
      payment: `payment-${scope}`,
    } as const

    const seedStatements = [
      {
        sql: "INSERT INTO organizations (id, code, name) VALUES (?, ?, ?)",
        params: [ids.organization, `school-order-${scope}`, "Linan Order Test School"],
      },
      {
        sql: "INSERT INTO families (id, organization_id, code, primary_contact_name, policy_version) VALUES (?, ?, ?, ?, ?)",
        params: [ids.family, ids.organization, `family-order-${scope}`, "Guardian", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO family_members (id, organization_id, family_id, code, display_name, policy_version) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)",
        params: [ids.memberOne, ids.organization, ids.family, `member-one-${scope}`, "Student One", DOMAIN_POLICY_VERSION, ids.memberTwo, ids.organization, ids.family, `member-two-${scope}`, "Student Two", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO catalog_items (id, organization_id, code, title, status, policy_version) VALUES (?, ?, ?, ?, ?, ?)",
        params: [ids.catalog, ids.organization, `catalog-order-${scope}`, "Order Test Trip", "active", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO tour_sessions (id, organization_id, catalog_item_id, code, status, price_fen, capacity, starts_at, ends_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [ids.session, ids.organization, ids.catalog, `session-order-${scope}`, TOUR_SESSION_STATUS.published, 1_200, 30, "2027-02-01 09:00:00.000000", "2027-02-01 17:00:00.000000", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO enrollments (id, organization_id, tour_session_id, family_id, code, contact_name, participant_count, status, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [ids.enrollment, ids.organization, ids.session, ids.family, `enrollment-order-${scope}`, "Guardian", 2, ENROLLMENT_STATUS.confirmed, DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO enrollment_participants (id, organization_id, enrollment_id, family_id, family_member_id, display_name_snapshot, grade_name_snapshot, class_name_snapshot, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [ids.participantOne, ids.organization, ids.enrollment, ids.family, ids.memberOne, "Student One", "Grade One", "Class One", DOMAIN_POLICY_VERSION, ids.participantTwo, ids.organization, ids.enrollment, ids.family, ids.memberTwo, "Student Two", "Grade One", "Class One", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO orders (id, organization_id, enrollment_id, code, request_idempotency_key, payer_name, status, amount_fen, paid_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [ids.order, ids.organization, ids.enrollment, `order-${scope}`, `request-${scope}`, "Guardian", ORDER_STATUS.paid, 2_400, 2_400, DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO order_lines (id, organization_id, order_id, enrollment_participant_id, display_name_snapshot, grade_name_snapshot, class_name_snapshot, amount_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [`line-one-${scope}`, ids.organization, ids.order, ids.participantOne, "Student One", "Grade One", "Class One", 1_200, DOMAIN_POLICY_VERSION, `line-two-${scope}`, ids.organization, ids.order, ids.participantTwo, "Student Two", "Grade One", "Class One", 1_200, DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO payments (id, organization_id, order_id, payment_no, provider_transaction_id, provider_event_id, status, amount_fen, channel, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [ids.payment, ids.organization, ids.order, `payment-${scope}`, `transaction-${scope}`, `event-${scope}`, PAYMENT_STATUS.succeeded, 2_400, "mock", DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO payment_events (id, organization_id, payment_id, provider, provider_event_id, provider_transaction_id, status, amount_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [`payment-event-${scope}`, ids.organization, ids.payment, "mock", `event-${scope}`, `transaction-${scope}`, PAYMENT_STATUS.succeeded, 2_400, DOMAIN_POLICY_VERSION],
      },
      {
        sql: "INSERT INTO roster_entries (id, organization_id, tour_session_id, enrollment_id, enrollment_participant_id, display_name, credential_hash, status, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [`roster-one-${scope}`, ids.organization, ids.session, ids.enrollment, ids.participantOne, "Student One", `credential-one-${scope}`, ROSTER_STATUS.pending, DOMAIN_POLICY_VERSION, `roster-two-${scope}`, ids.organization, ids.session, ids.enrollment, ids.participantTwo, "Student Two", `credential-two-${scope}`, ROSTER_STATUS.pending, DOMAIN_POLICY_VERSION],
      },
    ] satisfies readonly Statement[]
    await dataSource.transaction(async (manager) => {
      for (const statement of seedStatements) {
        await manager.query(statement.sql, statement.params)
      }
    })

    await expect(
      dataSource.query(
        "INSERT INTO order_lines (id, organization_id, order_id, enrollment_participant_id, display_name_snapshot, amount_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [`duplicate-line-${scope}`, ids.organization, ids.order, ids.participantOne, "Duplicate", 1_200, DOMAIN_POLICY_VERSION],
      ),
    ).rejects.toThrow()
    await expect(
      dataSource.query(
        "INSERT INTO payment_events (id, organization_id, payment_id, provider, provider_event_id, status, amount_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          `duplicate-event-${scope}`,
          ids.organization,
          ids.payment,
          "mock",
          `event-${scope}`,
          PAYMENT_STATUS.succeeded,
          2_400,
          DOMAIN_POLICY_VERSION,
        ],
      ),
    ).rejects.toThrow()
    await expect(
      dataSource.query(
        "INSERT INTO roster_entries (id, organization_id, tour_session_id, enrollment_id, enrollment_participant_id, display_name, credential_hash, status, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          `duplicate-roster-${scope}`,
          ids.organization,
          ids.session,
          ids.enrollment,
          ids.participantOne,
          "Duplicate",
          `duplicate-credential-${scope}`,
          ROSTER_STATUS.pending,
          DOMAIN_POLICY_VERSION,
        ],
      ),
    ).rejects.toThrow()

    const storedLines = await dataSource.query(
      "SELECT display_name_snapshot, grade_name_snapshot, class_name_snapshot, amount_fen FROM order_lines WHERE order_id = ? ORDER BY display_name_snapshot",
      [ids.order],
    )
    const storedEvent = await dataSource.query(
      "SELECT provider, provider_event_id, provider_transaction_id, status, amount_fen FROM payment_events WHERE payment_id = ?",
      [ids.payment],
    )
    const rosterCount = await dataSource.query(
      "SELECT COUNT(*) AS roster_count FROM roster_entries WHERE enrollment_id = ? AND enrollment_participant_id IS NOT NULL",
      [ids.enrollment],
    )
    const tables = await dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('order_lines', 'payment_events') ORDER BY table_name",
    )
    const columns = await dataSource.query(
      "SELECT table_name AS tableName, column_name AS columnName, column_type AS columnType, is_nullable AS isNullable FROM information_schema.columns WHERE table_schema = DATABASE() AND (table_name IN ('order_lines', 'payment_events') OR (table_name = 'roster_entries' AND column_name = 'enrollment_participant_id')) ORDER BY table_name, ordinal_position",
    )
    const constraints = await dataSource.query(
      "SELECT constraint_name AS constraintName, table_name AS tableName, column_name AS columnName, referenced_table_name AS referencedTableName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND constraint_name IN ('fk_order_lines_organization', 'fk_order_lines_order', 'fk_order_lines_enrollment_participant', 'fk_payment_events_organization', 'fk_payment_events_payment', 'fk_roster_entries_enrollment_participant') ORDER BY constraint_name",
    )
    const indexes = await dataSource.query(
      "SELECT DISTINCT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('uq_order_lines_order_participant', 'idx_order_lines_organization', 'idx_order_lines_participant', 'uq_payment_events_provider_event', 'idx_payment_events_organization', 'idx_payment_events_payment', 'uq_roster_entries_enrollment_participant') ORDER BY index_name",
    )
    const schemaLog = await dataSource.driver.createSchemaBuilder().log()

    expect(storedLines).toHaveLength(2)
    expect(storedEvent).toEqual([
      expect.objectContaining({
        provider: "mock",
        provider_event_id: `event-${scope}`,
        provider_transaction_id: `transaction-${scope}`,
        status: PAYMENT_STATUS.succeeded,
        amount_fen: 2_400,
      }),
    ])
    expect(rosterCount).toEqual([{ roster_count: "2" }])
    expect(tables).toHaveLength(2)
    expect(columns).toHaveLength(29)
    expect(columns).toEqual(expect.arrayContaining([
      "participant_kind_snapshot", "identity_ciphertext_snapshot", "identity_hash_snapshot", "identity_masked_snapshot",
      "phone_ciphertext_snapshot", "phone_hash_snapshot", "phone_masked_snapshot", "person_data_key_version_snapshot",
    ].map((columnName) => expect.objectContaining({ tableName: "order_lines", columnName }))))
    expect(constraints).toHaveLength(6)
    expect(indexes).toHaveLength(7)
    expect(schemaLog.upQueries).toHaveLength(0)
    expect(schemaLog.downQueries).toHaveLength(0)

    if (schemaEvidencePath !== undefined) {
      await writeFile(
        schemaEvidencePath,
        JSON.stringify(
          {
            migrations: { firstRun: migrated.map(({ name }) => name), cycled: shouldCycleMigration },
            persisted: { storedLines, storedEvent, rosterCount },
            schema: { tables, columns, constraints, indexes },
            schemaBuilder: { up: schemaLog.upQueries.length, down: schemaLog.downQueries.length },
            ok: true,
          },
          null,
          2,
        ),
        "utf8",
      )
    }
  }, 30_000)
})
