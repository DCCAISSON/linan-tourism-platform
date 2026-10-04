import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import {
  DOMAIN_POLICY_VERSION,
  ENROLLMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
  TOUR_SESSION_STATUS,
} from "@linan/contracts"
import { describe, expect, it } from "vitest"
import { DOMAIN_DATA_SOURCE_OPTIONS, createDomainDataSource } from "../src/domain/data-source.js"
import { RefundRequestEntity, RefundRequestLineEntity } from "../src/domain/entities/index.js"
import { AddPhoneAuthentication1766020000000 } from "../src/migrations/1766020000000-AddPhoneAuthentication.js"
import { AddRefundRequestSchema1765933200000 } from "../src/migrations/1765933200000-AddRefundRequestSchema.js"
import { STAFF_PERMISSION_KEYS } from "../src/modules/iam/staff-permissions.js"

const databaseUrl = process.env["DOMAIN_TEST_DATABASE_URL"]
const schemaEvidencePath = process.env["REFUND_SCHEMA_EVIDENCE_PATH"]
const shouldCycleMigration = process.env["REFUND_SCHEMA_CYCLE_MIGRATION"] === "1"

type Statement = { readonly sql: string; readonly params: readonly unknown[] }

describe("Refund schema contracts without database", () => {
  it("registers refund entities migration and staff permission", () => {
    expect(STAFF_PERMISSION_KEYS).toContain("refunds.manage")
    expect(DOMAIN_DATA_SOURCE_OPTIONS.entities).toContain(RefundRequestEntity)
    expect(DOMAIN_DATA_SOURCE_OPTIONS.entities).toContain(RefundRequestLineEntity)
    expect(DOMAIN_DATA_SOURCE_OPTIONS.migrations).toContain(AddRefundRequestSchema1765933200000)
  })
})

describe.skipIf(databaseUrl === undefined)("Refund schema contracts", () => {
  it("persists refund requests lines and reversible constraints", async () => {
    const dataSource = createDomainDataSource(databaseUrl ?? "")
    await dataSource.initialize()

    try {
      const migrated = await dataSource.runMigrations()
      expect(await dataSource.runMigrations()).toEqual([])
      if (shouldCycleMigration) {
        expect(migrated.map(({ name }) => name)).toContain("AddRefundRequestSchema1765933200000")
        await dataSource.undoLastMigration()
        const rerun = await dataSource.runMigrations()
        expect(rerun.map(({ name }) => name)).toEqual([new AddPhoneAuthentication1766020000000().name])
        expect(await dataSource.runMigrations()).toEqual([])
      }

      expect(dataSource.hasMetadata(RefundRequestEntity)).toBe(true)
      expect(dataSource.hasMetadata(RefundRequestLineEntity)).toBe(true)

      const scope = randomUUID()
      const ids = {
        organization: `org-refund-${scope}`,
        family: `family-refund-${scope}`,
        member: `member-refund-${scope}`,
        catalog: `catalog-refund-${scope}`,
        session: `session-refund-${scope}`,
        enrollment: `enrollment-refund-${scope}`,
        participant: `participant-refund-${scope}`,
        order: `order-refund-${scope}`,
        orderLine: `line-refund-${scope}`,
        payment: `payment-refund-${scope}`,
        staff: `staff-refund-${scope}`,
        refund: `refund-${scope}`,
      } as const
      const seedStatements = [
        {
          sql: "INSERT INTO organizations (id, code, name) VALUES (?, ?, ?)",
          params: [ids.organization, `school-refund-${scope}`, "Linan Refund Test School"],
        },
        {
          sql: "INSERT INTO families (id, organization_id, code, primary_contact_name, policy_version) VALUES (?, ?, ?, ?, ?)",
          params: [ids.family, ids.organization, `family-refund-${scope}`, "Guardian", DOMAIN_POLICY_VERSION],
        },
        {
          sql: "INSERT INTO family_members (id, organization_id, family_id, code, display_name, policy_version) VALUES (?, ?, ?, ?, ?, ?)",
          params: [ids.member, ids.organization, ids.family, `member-refund-${scope}`, "Student One", DOMAIN_POLICY_VERSION],
        },
        {
          sql: "INSERT INTO catalog_items (id, organization_id, code, title, status, policy_version) VALUES (?, ?, ?, ?, ?, ?)",
          params: [ids.catalog, ids.organization, `catalog-refund-${scope}`, "Refund Test Trip", "active", DOMAIN_POLICY_VERSION],
        },
        {
          sql: "INSERT INTO tour_sessions (id, organization_id, catalog_item_id, code, status, price_fen, capacity, starts_at, ends_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          params: [
            ids.session,
            ids.organization,
            ids.catalog,
            `session-refund-${scope}`,
            TOUR_SESSION_STATUS.published,
            1_200,
            30,
            "2027-02-01 09:00:00.000000",
            "2027-02-01 17:00:00.000000",
            DOMAIN_POLICY_VERSION,
          ],
        },
        {
          sql: "INSERT INTO enrollments (id, organization_id, tour_session_id, family_id, code, contact_name, participant_count, status, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          params: [
            ids.enrollment,
            ids.organization,
            ids.session,
            ids.family,
            `enrollment-refund-${scope}`,
            "Guardian",
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
            "Student One",
            "Grade One",
            "Class One",
            DOMAIN_POLICY_VERSION,
          ],
        },
        {
          sql: "INSERT INTO orders (id, organization_id, enrollment_id, code, request_idempotency_key, payer_name, status, amount_fen, paid_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          params: [
            ids.order,
            ids.organization,
            ids.enrollment,
            `order-refund-${scope}`,
            `request-refund-${scope}`,
            "Guardian",
            ORDER_STATUS.paid,
            1_200,
            1_200,
            DOMAIN_POLICY_VERSION,
          ],
        },
        {
          sql: "INSERT INTO order_lines (id, organization_id, order_id, enrollment_participant_id, display_name_snapshot, grade_name_snapshot, class_name_snapshot, amount_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          params: [
            ids.orderLine,
            ids.organization,
            ids.order,
            ids.participant,
            "Student One",
            "Grade One",
            "Class One",
            1_200,
            DOMAIN_POLICY_VERSION,
          ],
        },
        {
          sql: "INSERT INTO payments (id, organization_id, order_id, payment_no, provider_transaction_id, provider_event_id, status, amount_fen, channel, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          params: [
            ids.payment,
            ids.organization,
            ids.order,
            `payment-refund-${scope}`,
            `transaction-refund-${scope}`,
            `event-refund-${scope}`,
            PAYMENT_STATUS.succeeded,
            1_200,
            "mock",
            DOMAIN_POLICY_VERSION,
          ],
        },
        {
          sql: "INSERT INTO staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version) VALUES (?, ?, ?, ?, 'active', false, 0, 1)",
          params: [ids.staff, `refund-${scope}`, "Refund Staff", "hash"],
        },
      ] satisfies readonly Statement[]

      await dataSource.transaction(async (manager) => {
        for (const statement of seedStatements) {
          await manager.query(statement.sql, statement.params)
        }
      })

      await dataSource.query(
        "INSERT INTO refund_requests (id, organization_id, order_id, provider, idempotency_key, status, reason, note, amount_fen, requested_by_staff_id, processed_by_staff_id, failure_message, requested_at, processed_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp(6), current_timestamp(6), ?)",
        [
          ids.refund,
          ids.organization,
          ids.order,
          "local_validation",
          `idem-refund-${scope}`,
          REFUND_STATUS.failed,
          "guardian cancelled",
          "kept as failed attempt",
          1_200,
          ids.staff,
          ids.staff,
          "local validation rejected",
          DOMAIN_POLICY_VERSION,
        ],
      )
      await dataSource.query(
        "INSERT INTO refund_request_lines (id, organization_id, refund_request_id, order_line_id, amount_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?)",
        [`refund-line-${scope}`, ids.organization, ids.refund, ids.orderLine, 1_200, DOMAIN_POLICY_VERSION],
      )

      await expect(
        dataSource.query(
          "INSERT INTO refund_requests (id, organization_id, order_id, provider, idempotency_key, status, reason, amount_fen, requested_by_staff_id, requested_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp(6), ?)",
          [
            `refund-duplicate-${scope}`,
            ids.organization,
            ids.order,
            "local_validation",
            `idem-refund-${scope}`,
            REFUND_STATUS.pending,
            "duplicate idempotency",
            1_200,
            ids.staff,
            DOMAIN_POLICY_VERSION,
          ],
        ),
      ).rejects.toThrow()
      await expect(
        dataSource.query(
          "INSERT INTO refund_requests (id, organization_id, order_id, provider, idempotency_key, status, reason, amount_fen, requested_by_staff_id, requested_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp(6), ?)",
          [
            `refund-missing-staff-${scope}`,
            ids.organization,
            ids.order,
            "local_validation",
            `idem-missing-staff-${scope}`,
            REFUND_STATUS.pending,
            "missing staff foreign key",
            1_200,
            `missing-staff-${scope}`,
            DOMAIN_POLICY_VERSION,
          ],
        ),
      ).rejects.toThrow()
      await expect(
        dataSource.query(
          "INSERT INTO refund_request_lines (id, organization_id, refund_request_id, order_line_id, amount_fen, policy_version) VALUES (?, ?, ?, ?, ?, ?)",
          [`refund-line-duplicate-${scope}`, ids.organization, ids.refund, ids.orderLine, 1_200, DOMAIN_POLICY_VERSION],
        ),
      ).rejects.toThrow()
      await expect(
        dataSource.query(
          "INSERT INTO refund_requests (id, organization_id, order_id, provider, idempotency_key, status, reason, amount_fen, requested_by_staff_id, requested_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp(6), ?)",
          [
            `refund-negative-${scope}`,
            ids.organization,
            ids.order,
            "local_validation",
            `idem-negative-${scope}`,
            REFUND_STATUS.pending,
            "negative amount",
            -1,
            ids.staff,
            DOMAIN_POLICY_VERSION,
          ],
        ),
      ).rejects.toThrow()

      const storedRequest = await dataSource.query(
        "SELECT provider, idempotency_key, status, reason, note, amount_fen, requested_by_staff_id, processed_by_staff_id, failure_message FROM refund_requests WHERE id = ?",
        [ids.refund],
      )
      const storedLines = await dataSource.query(
        "SELECT refund_request_id, order_line_id, amount_fen FROM refund_request_lines WHERE refund_request_id = ?",
        [ids.refund],
      )
      const tables = await dataSource.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('refund_requests', 'refund_request_lines') ORDER BY table_name",
      )
      const constraints = await dataSource.query(
        "SELECT constraint_name AS constraintName, table_name AS tableName, column_name AS columnName, referenced_table_name AS referencedTableName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND constraint_name IN ('fk_refund_requests_organization', 'fk_refund_requests_order', 'fk_refund_requests_requested_by_staff', 'fk_refund_requests_processed_by_staff', 'fk_refund_request_lines_organization', 'fk_refund_request_lines_refund_request', 'fk_refund_request_lines_order_line') ORDER BY constraint_name",
      )
      const indexes = await dataSource.query(
        "SELECT DISTINCT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('uq_refund_requests_org_idempotency_key', 'idx_refund_requests_order', 'idx_refund_requests_requested_by_staff', 'idx_refund_requests_processed_by_staff', 'uq_refund_request_lines_request_line', 'idx_refund_request_lines_order_line') ORDER BY indexName",
      )
      const staffForeignKeyCollations: readonly { readonly tableName: string; readonly columnName: string; readonly characterSet: string; readonly collationName: string }[] = await dataSource.query(
        "SELECT table_name AS tableName, column_name AS columnName, character_set_name AS characterSet, collation_name AS collationName FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'staff_accounts' AND column_name = 'id') OR (table_name = 'refund_requests' AND column_name IN ('requested_by_staff_id', 'processed_by_staff_id'))) ORDER BY table_name, column_name",
      )
      const schemaLog = await dataSource.driver.createSchemaBuilder().log()
      const refundSchemaQueryPattern = /`refund_requests`|`refund_request_lines`/u
      const pendingRefundSchemaUpQueries = schemaLog.upQueries.filter(({ query }) =>
        refundSchemaQueryPattern.test(query),
      )
      const pendingRefundSchemaDownQueries = schemaLog.downQueries.filter(({ query }) =>
        refundSchemaQueryPattern.test(query),
      )

      expect(storedRequest).toEqual([
        expect.objectContaining({
          provider: "local_validation",
          idempotency_key: `idem-refund-${scope}`,
          status: REFUND_STATUS.failed,
          reason: "guardian cancelled",
          note: "kept as failed attempt",
          amount_fen: 1_200,
          requested_by_staff_id: ids.staff,
          processed_by_staff_id: ids.staff,
          failure_message: "local validation rejected",
        }),
      ])
      expect(storedLines).toEqual([
        expect.objectContaining({
          refund_request_id: ids.refund,
          order_line_id: ids.orderLine,
          amount_fen: 1_200,
        }),
      ])
      expect(tables).toHaveLength(2)
      expect(constraints).toHaveLength(7)
      expect(indexes).toHaveLength(6)
      expect(staffForeignKeyCollations).toEqual([
        { tableName: "refund_requests", columnName: "processed_by_staff_id", characterSet: "utf8mb4", collationName: "utf8mb4_unicode_ci" },
        { tableName: "refund_requests", columnName: "requested_by_staff_id", characterSet: "utf8mb4", collationName: "utf8mb4_unicode_ci" },
        { tableName: "staff_accounts", columnName: "id", characterSet: "utf8mb4", collationName: "utf8mb4_unicode_ci" },
      ])
      expect(pendingRefundSchemaUpQueries).toHaveLength(0)
      expect(pendingRefundSchemaDownQueries).toHaveLength(0)

      if (schemaEvidencePath !== undefined) {
        await writeFile(
          schemaEvidencePath,
          JSON.stringify(
            {
              migrations: { firstRun: migrated.map(({ name }) => name), cycled: shouldCycleMigration },
              persisted: { storedRequest, storedLines },
              schema: { tables, constraints, indexes },
              schemaBuilder: {
                refundUp: pendingRefundSchemaUpQueries.length,
                refundDown: pendingRefundSchemaDownQueries.length,
              },
              ok: true,
            },
            null,
            2,
          ),
          "utf8",
        )
      }
    } finally {
      await dataSource.destroy()
    }
  }, 30_000)
})
