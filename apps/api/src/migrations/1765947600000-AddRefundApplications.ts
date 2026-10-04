import type { MigrationInterface, QueryRunner } from "typeorm"

export const ADD_REFUND_APPLICATIONS_SQL = `CREATE TABLE refund_applications (
  id varchar(64) NOT NULL,
  organization_id varchar(64) NOT NULL,
  order_id varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  status varchar(32) NOT NULL,
  reason varchar(255) NOT NULL,
  amount_fen int unsigned NOT NULL,
  \`lines\` json NOT NULL,
  review_reason text NULL,
  reviewed_by_staff_id varchar(64) NULL,
  reviewed_at datetime(6) NULL,
  refund_request_id varchar(64) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_refund_applications_order_key (order_id, idempotency_key),
  KEY idx_refund_applications_status (status, created_at),
  CONSTRAINT fk_refund_applications_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_refund_applications_reviewer FOREIGN KEY (reviewed_by_staff_id) REFERENCES staff_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_refund_applications_refund FOREIGN KEY (refund_request_id) REFERENCES refund_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`

export class AddRefundApplications1765947600000 implements MigrationInterface {
  readonly name = "AddRefundApplications1765947600000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(ADD_REFUND_APPLICATIONS_SQL)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE refund_applications")
  }
}
