import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddInsuranceWorkspace1765954800000 implements MigrationInterface {
  readonly name = "AddInsuranceWorkspace1765954800000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE insurance_batches (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        roster_version varchar(64) NOT NULL,
        status varchar(32) NOT NULL,
        company_template_name varchar(120) NULL,
        submitted_at datetime(6) NULL,
        created_by varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_insurance_batches_session (tour_session_id, created_at),
        KEY idx_insurance_batches_roster_version (tour_session_id, roster_version),
        CONSTRAINT fk_insurance_batches_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_insurance_batches_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE insurance_batch_people (
        id varchar(64) NOT NULL,
        batch_id varchar(64) NOT NULL,
        person_ref varchar(96) NOT NULL,
        source_refs_json json NOT NULL,
        display_name varchar(120) NOT NULL,
        class_name varchar(120) NULL,
        identity_masked varchar(64) NULL,
        identity_ciphertext text NULL,
        phone_masked varchar(32) NULL,
        phone_ciphertext text NULL,
        person_data_key_version varchar(16) NOT NULL,
        status varchar(32) NOT NULL,
        issue_code varchar(32) NULL,
        policy_number varchar(120) NULL,
        receipt_reference varchar(255) NULL,
        coverage_start date NULL,
        coverage_end date NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_insurance_batch_people_person (batch_id, person_ref),
        KEY idx_insurance_batch_people_status (batch_id, status),
        CONSTRAINT fk_insurance_batch_people_batch FOREIGN KEY (batch_id) REFERENCES insurance_batches(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE insurance_handoffs (
        id varchar(64) NOT NULL,
        batch_id varchar(64) NOT NULL,
        kind varchar(32) NOT NULL,
        roster_version varchar(64) NOT NULL,
        actor_id varchar(64) NOT NULL,
        note text NOT NULL,
        receipt_reference varchar(255) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_insurance_handoffs_batch (batch_id, created_at),
        CONSTRAINT fk_insurance_handoffs_batch FOREIGN KEY (batch_id) REFERENCES insurance_batches(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE insurance_handoffs")
    await queryRunner.query("DROP TABLE insurance_batch_people")
    await queryRunner.query("DROP TABLE insurance_batches")
  }
}
