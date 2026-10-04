import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddOrderChangeRequests1766023000000 implements MigrationInterface {
  readonly name = "AddOrderChangeRequests1766023000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE order_change_requests (
      id varchar(64) NOT NULL,
      organization_id varchar(64) NOT NULL,
      order_id varchar(64) NOT NULL,
      kind varchar(24) NOT NULL,
      original_line_id varchar(64) NULL,
      idempotency_key varchar(128) NOT NULL,
      submission_fingerprint char(64) NOT NULL,
      status varchar(32) NOT NULL,
      version int unsigned NOT NULL DEFAULT 1,
      reason varchar(255) NOT NULL,
      original_snapshot json NOT NULL,
      proposed_participant json NOT NULL,
      history json NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_order_changes_order_key (order_id, idempotency_key),
      KEY idx_order_changes_status (status, created_at),
      CONSTRAINT fk_order_changes_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_order_changes_original_line FOREIGN KEY (original_line_id) REFERENCES order_lines(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE order_change_requests")
  }
}
