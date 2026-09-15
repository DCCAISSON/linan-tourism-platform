import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddOrderPaymentSchema1765908000000 implements MigrationInterface {
  readonly name = "AddOrderPaymentSchema1765908000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE order_lines (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        order_id varchar(64) NOT NULL,
        enrollment_participant_id varchar(64) NOT NULL,
        display_name_snapshot varchar(120) NOT NULL,
        grade_name_snapshot varchar(120) NULL,
        class_name_snapshot varchar(120) NULL,
        amount_fen int unsigned NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_order_lines_order_participant (order_id, enrollment_participant_id),
        KEY idx_order_lines_organization (organization_id),
        KEY idx_order_lines_participant (enrollment_participant_id),
        CONSTRAINT fk_order_lines_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_order_lines_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_order_lines_enrollment_participant FOREIGN KEY (enrollment_participant_id) REFERENCES enrollment_participants(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE payment_events (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        payment_id varchar(64) NOT NULL,
        provider varchar(32) NOT NULL,
        provider_event_id varchar(128) NOT NULL,
        provider_transaction_id varchar(128) NULL,
        status varchar(32) NOT NULL,
        amount_fen int unsigned NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_payment_events_provider_event (provider, provider_event_id),
        KEY idx_payment_events_organization (organization_id),
        KEY idx_payment_events_payment (payment_id),
        CONSTRAINT fk_payment_events_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_payment_events_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      ALTER TABLE roster_entries
        ADD enrollment_participant_id varchar(64) NULL AFTER enrollment_id,
        ADD UNIQUE KEY uq_roster_entries_enrollment_participant (enrollment_participant_id),
        ADD CONSTRAINT fk_roster_entries_enrollment_participant FOREIGN KEY (enrollment_participant_id) REFERENCES enrollment_participants(id) ON UPDATE CASCADE ON DELETE RESTRICT
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE roster_entries DROP FOREIGN KEY fk_roster_entries_enrollment_participant",
    )
    await queryRunner.query(
      "ALTER TABLE roster_entries DROP KEY uq_roster_entries_enrollment_participant",
    )
    await queryRunner.query("ALTER TABLE roster_entries DROP COLUMN enrollment_participant_id")
    await queryRunner.query("DROP TABLE payment_events")
    await queryRunner.query("DROP TABLE order_lines")
  }
}
