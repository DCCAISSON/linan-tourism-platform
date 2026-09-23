import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddRefundRequestSchema1765933200000 implements MigrationInterface {
  readonly name = "AddRefundRequestSchema1765933200000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE refund_requests (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        order_id varchar(64) NOT NULL,
        provider varchar(32) NOT NULL,
        idempotency_key varchar(128) NOT NULL,
        status varchar(32) NOT NULL,
        reason varchar(255) NOT NULL,
        note text NULL,
        amount_fen int unsigned NOT NULL,
        requested_by_staff_id varchar(64) NOT NULL,
        processed_by_staff_id varchar(64) NULL,
        failure_message text NULL,
        requested_at datetime(6) NOT NULL,
        processed_at datetime(6) NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_refund_requests_org_idempotency_key (organization_id, idempotency_key),
        KEY idx_refund_requests_order (order_id),
        KEY idx_refund_requests_requested_by_staff (requested_by_staff_id),
        KEY idx_refund_requests_processed_by_staff (processed_by_staff_id),
        CONSTRAINT fk_refund_requests_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_refund_requests_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_refund_requests_requested_by_staff FOREIGN KEY (requested_by_staff_id) REFERENCES staff_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_refund_requests_processed_by_staff FOREIGN KEY (processed_by_staff_id) REFERENCES staff_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE refund_request_lines (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        refund_request_id varchar(64) NOT NULL,
        order_line_id varchar(64) NOT NULL,
        amount_fen int unsigned NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_refund_request_lines_request_line (refund_request_id, order_line_id),
        KEY idx_refund_request_lines_organization (organization_id),
        KEY idx_refund_request_lines_order_line (order_line_id),
        CONSTRAINT fk_refund_request_lines_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_refund_request_lines_refund_request FOREIGN KEY (refund_request_id) REFERENCES refund_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_refund_request_lines_order_line FOREIGN KEY (order_line_id) REFERENCES order_lines(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE refund_request_lines")
    await queryRunner.query("DROP TABLE refund_requests")
  }
}
