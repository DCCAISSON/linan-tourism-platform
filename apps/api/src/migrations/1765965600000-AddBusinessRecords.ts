import type { MigrationInterface, QueryRunner } from "typeorm"
export class AddBusinessRecords1765965600000 implements MigrationInterface {
  readonly name = "AddBusinessRecords1765965600000"
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE business_products (
      id varchar(64) NOT NULL PRIMARY KEY, organization_id varchar(64) NOT NULL,
      category varchar(24) NOT NULL, title varchar(160) NOT NULL, offering varchar(500) NOT NULL, content text NOT NULL,
      reference_price_fen int NULL, customer_service_phone varchar(32) NOT NULL, booking_url varchar(2048) NOT NULL,
      booking_authorized boolean NOT NULL DEFAULT false, media json NOT NULL, media_authorized boolean NOT NULL DEFAULT false,
      status varchar(24) NOT NULL, version int NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      KEY idx_business_products_org (organization_id),
      CONSTRAINT fk_business_products_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE business_inquiries (
      id varchar(64) NOT NULL PRIMARY KEY, product_id varchar(64) NOT NULL, organization_id varchar(64) NOT NULL,
      idempotency_key varchar(64) NOT NULL, request_hash varchar(64) NOT NULL,
      customer_type varchar(24) NOT NULL, organization_name varchar(160) NOT NULL, contact_name varchar(80) NOT NULL,
      phone varchar(32) NOT NULL, request text NOT NULL, status varchar(24) NOT NULL, owner_staff_account_id varchar(64) NULL,
      version int NOT NULL DEFAULT 1, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_business_inquiries_replay (product_id,idempotency_key),
      CONSTRAINT fk_business_inquiries_product FOREIGN KEY (product_id) REFERENCES business_products(id) ON DELETE RESTRICT,
      CONSTRAINT fk_business_inquiries_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
      CONSTRAINT fk_business_inquiries_owner FOREIGN KEY (owner_staff_account_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE business_followups (
      id varchar(64) NOT NULL PRIMARY KEY, inquiry_id varchar(64) NOT NULL, idempotency_key varchar(64) NOT NULL,
      request_hash varchar(64) NOT NULL, actor_id varchar(64) NOT NULL, owner_staff_account_id varchar(64) NOT NULL,
      status varchar(24) NOT NULL, note text NOT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_business_followups_replay (inquiry_id,idempotency_key),
      CONSTRAINT fk_business_followups_inquiry FOREIGN KEY (inquiry_id) REFERENCES business_inquiries(id) ON DELETE RESTRICT,
      CONSTRAINT fk_business_followups_owner FOREIGN KEY (owner_staff_account_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE business_followups")
    await queryRunner.query("DROP TABLE business_inquiries")
    await queryRunner.query("DROP TABLE business_products")
  }
}
