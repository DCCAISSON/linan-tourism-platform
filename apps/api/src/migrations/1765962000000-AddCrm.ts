import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddCrm1765962000000 implements MigrationInterface {
  readonly name = "AddCrm1765962000000"
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE crm_customers (
      id varchar(64) NOT NULL, organization_id varchar(64) NOT NULL, display_name varchar(120) NOT NULL,
      birth_date date NOT NULL, adult_confirmed_by varchar(64) NOT NULL, phone_ciphertext text NOT NULL,
      phone_masked varchar(32) NOT NULL, person_data_key_version varchar(16) NOT NULL,
      source varchar(120) NOT NULL, tags json NOT NULL, marketing_consent varchar(16) NOT NULL,
      owner_id varchar(64) NULL, family_id varchar(64) NULL, next_followup_at datetime(6) NULL,
      version int unsigned NOT NULL DEFAULT 1, request_key varchar(128) NOT NULL, request_hash char(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY(id), UNIQUE KEY uq_crm_customer_request(organization_id, request_key),
      KEY idx_crm_customer_owner(owner_id), KEY idx_crm_customer_family(family_id),
      CONSTRAINT fk_crm_customer_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_crm_customer_owner FOREIGN KEY(owner_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_crm_customer_family FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE crm_followups (
      id varchar(64) NOT NULL, customer_id varchar(64) NOT NULL, content varchar(1000) NOT NULL,
      next_followup_at datetime(6) NULL, created_by varchar(64) NOT NULL,
      request_key varchar(128) NOT NULL, request_hash char(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY(id), UNIQUE KEY uq_crm_followup_request(customer_id, request_key),
      CONSTRAINT fk_crm_followup_customer FOREIGN KEY(customer_id) REFERENCES crm_customers(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE crm_followups")
    await queryRunner.query("DROP TABLE crm_customers")
  }
}
