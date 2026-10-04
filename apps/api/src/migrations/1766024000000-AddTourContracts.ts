import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddTourContracts1766024000000 implements MigrationInterface {
  readonly name = "AddTourContracts1766024000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE contract_template_versions (
      id varchar(64) NOT NULL, organization_id varchar(64) NOT NULL, tour_session_id varchar(64) NOT NULL,
      version varchar(64) NOT NULL, title varchar(200) NOT NULL, kind varchar(32) NOT NULL,
      body_ciphertext mediumtext NOT NULL, body_key_version varchar(16) NOT NULL,
      source_filename varchar(255) NOT NULL, source_sha256 char(64) NOT NULL,
      body_sha256 char(64) NOT NULL, created_by varchar(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
      UNIQUE KEY uq_contract_templates_session_version (tour_session_id, version),
      CONSTRAINT fk_contract_templates_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_contract_templates_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query("ALTER TABLE tour_sessions ADD active_contract_template_id varchar(64) NULL")
    await queryRunner.query(`CREATE TABLE order_contracts (
      id varchar(64) NOT NULL, organization_id varchar(64) NOT NULL, tour_session_id varchar(64) NOT NULL,
      family_id varchar(64) NOT NULL, enrollment_id varchar(64) NOT NULL, order_id varchar(64) NOT NULL,
      snapshot_ciphertext mediumtext NOT NULL, snapshot_key_version varchar(16) NOT NULL, snapshot_hash char(64) NOT NULL,
      signed_at datetime(6) NULL, signer_actor_id varchar(64) NULL,
      phone_verified tinyint NOT NULL DEFAULT 0, signature_ciphertext mediumtext NULL,
      signature_key_version varchar(16) NULL, signature_hash char(64) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
      UNIQUE KEY uq_order_contracts_order (order_id),
      CONSTRAINT fk_order_contracts_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_order_contracts_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_order_contracts_family FOREIGN KEY (family_id) REFERENCES families(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_order_contracts_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_order_contracts_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE order_contracts")
    await queryRunner.query("ALTER TABLE tour_sessions DROP COLUMN active_contract_template_id")
    await queryRunner.query("DROP TABLE contract_template_versions")
  }
}
