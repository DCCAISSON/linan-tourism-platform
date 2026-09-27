import type { MigrationInterface, QueryRunner } from "typeorm"

export class BusinessInquiryCustomerLinks1766008800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE business_inquiries ADD customer_id varchar(64) NULL, ADD CONSTRAINT fk_business_inquiry_customer FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE RESTRICT ON UPDATE CASCADE")
    await queryRunner.query(`CREATE TABLE business_inquiry_customer_links (
      id varchar(64) NOT NULL PRIMARY KEY,
      inquiry_id varchar(64) NOT NULL,
      customer_id varchar(64) NOT NULL,
      action varchar(16) NOT NULL,
      inquiry_version int NOT NULL,
      actor_id varchar(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_inquiry_customer_link_customer (customer_id),
      UNIQUE KEY uq_inquiry_customer_link_version (inquiry_id, inquiry_version, action),
      CONSTRAINT fk_inquiry_customer_link_inquiry FOREIGN KEY (inquiry_id) REFERENCES business_inquiries(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_inquiry_customer_link_customer FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE business_inquiry_customer_links")
    await queryRunner.query("ALTER TABLE business_inquiries DROP FOREIGN KEY fk_business_inquiry_customer, DROP COLUMN customer_id")
  }
}
