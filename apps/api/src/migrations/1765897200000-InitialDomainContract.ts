import type { MigrationInterface, QueryRunner } from "typeorm"

export class InitialDomainContract1765897200000 implements MigrationInterface {
  readonly name = "InitialDomainContract1765897200000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE organizations (
        id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_organizations_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE catalog_items (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        title varchar(160) NOT NULL,
        status varchar(32) NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_catalog_items_org_code (organization_id, code),
        CONSTRAINT fk_catalog_items_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE tour_sessions (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        catalog_item_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        status varchar(32) NOT NULL,
        price_fen int unsigned NOT NULL,
        capacity int unsigned NOT NULL,
        starts_at datetime(6) NOT NULL,
        ends_at datetime(6) NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_tour_sessions_org_code (organization_id, code),
        KEY idx_tour_sessions_catalog_item (catalog_item_id),
        CONSTRAINT fk_tour_sessions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_tour_sessions_catalog_item FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE enrollments (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        contact_name varchar(120) NOT NULL,
        participant_count int unsigned NOT NULL,
        status varchar(32) NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_enrollments_org_code (organization_id, code),
        KEY idx_enrollments_tour_session (tour_session_id),
        CONSTRAINT fk_enrollments_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_enrollments_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE orders (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        enrollment_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        request_idempotency_key varchar(128) NOT NULL,
        payer_name varchar(120) NOT NULL,
        status varchar(32) NOT NULL,
        amount_fen int unsigned NOT NULL,
        paid_fen int unsigned NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_orders_enrollment (enrollment_id),
        UNIQUE KEY uq_orders_org_code (organization_id, code),
        UNIQUE KEY uq_orders_request_idempotency_key (request_idempotency_key),
        CONSTRAINT fk_orders_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_orders_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE payments (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        order_id varchar(64) NOT NULL,
        payment_no varchar(96) NOT NULL,
        provider_transaction_id varchar(128) NULL,
        provider_event_id varchar(128) NULL,
        status varchar(32) NOT NULL,
        amount_fen int unsigned NOT NULL,
        channel varchar(32) NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_payments_org_payment_no (organization_id, payment_no),
        UNIQUE KEY uq_payments_provider_transaction_id (provider_transaction_id),
        UNIQUE KEY uq_payments_provider_event_id (provider_event_id),
        KEY idx_payments_order (order_id),
        CONSTRAINT fk_payments_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE roster_entries (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        enrollment_id varchar(64) NOT NULL,
        display_name varchar(120) NOT NULL,
        credential_hash varchar(128) NOT NULL,
        status varchar(32) NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_roster_entries_session_credential (tour_session_id, credential_hash),
        KEY idx_roster_entries_enrollment (enrollment_id),
        KEY idx_roster_entries_organization (organization_id),
        CONSTRAINT fk_roster_entries_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_roster_entries_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_roster_entries_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE consent_records (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        subject_id varchar(64) NOT NULL,
        purpose varchar(64) NOT NULL,
        granted boolean NOT NULL,
        agreement_version varchar(64) NOT NULL,
        schema_version varchar(64) NOT NULL,
        accepted_at datetime(6) NOT NULL,
        revoked_at datetime(6) NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_consent_records_subject_purpose_agreement_schema (organization_id, subject_id, purpose, agreement_version, schema_version),
        KEY idx_consent_records_subject (subject_id),
        CONSTRAINT fk_consent_records_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_consent_records_subject FOREIGN KEY (subject_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        actor_id varchar(64) NOT NULL,
        action varchar(64) NOT NULL,
        target_type varchar(64) NOT NULL,
        target_id varchar(64) NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_audit_logs_target (target_type, target_id),
        KEY idx_audit_logs_organization (organization_id),
        CONSTRAINT fk_audit_logs_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE audit_logs")
    await queryRunner.query("DROP TABLE consent_records")
    await queryRunner.query("DROP TABLE roster_entries")
    await queryRunner.query("DROP TABLE payments")
    await queryRunner.query("DROP TABLE orders")
    await queryRunner.query("DROP TABLE enrollments")
    await queryRunner.query("DROP TABLE tour_sessions")
    await queryRunner.query("DROP TABLE catalog_items")
    await queryRunner.query("DROP TABLE organizations")
  }
}
