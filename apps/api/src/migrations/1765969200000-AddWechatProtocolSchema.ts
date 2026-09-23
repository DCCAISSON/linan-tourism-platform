import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddWechatProtocolSchema1765969200000 implements MigrationInterface {
  readonly name = "AddWechatProtocolSchema1765969200000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE wechat_family_sessions (
      id varchar(64) NOT NULL,
      organization_id varchar(64) NOT NULL,
      family_id varchar(64) NOT NULL,
      family_code varchar(64) NOT NULL,
      openid_hash char(64) NOT NULL,
      unionid_hash char(64) NULL,
      token_hash char(64) NOT NULL,
      expires_at datetime(6) NOT NULL,
      revoked_at datetime(6) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_wechat_family_sessions_token_hash (token_hash),
      KEY idx_wechat_family_sessions_openid_hash (openid_hash),
      KEY idx_wechat_family_sessions_family (family_id),
      CONSTRAINT fk_wechat_family_sessions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_wechat_family_sessions_family FOREIGN KEY (family_id) REFERENCES families(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE wechat_transactions (
      id varchar(64) NOT NULL,
      organization_id varchar(64) NOT NULL,
      kind varchar(16) NOT NULL,
      event_id varchar(128) NOT NULL,
      order_id varchar(64) NULL,
      refund_request_id varchar(64) NULL,
      out_trade_no varchar(32) NULL,
      out_refund_no varchar(32) NULL,
      provider_transaction_id varchar(128) NULL,
      status varchar(32) NOT NULL,
      amount_fen int unsigned NOT NULL,
      abnormal_reason varchar(255) NULL,
      raw_payload json NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_wechat_transactions_event (kind, event_id),
      UNIQUE KEY uq_wechat_transactions_out_trade_no (out_trade_no),
      UNIQUE KEY uq_wechat_transactions_out_refund_no (out_refund_no),
      KEY idx_wechat_transactions_order (order_id),
      KEY idx_wechat_transactions_refund (refund_request_id),
      CONSTRAINT fk_wechat_transactions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_wechat_transactions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_wechat_transactions_refund FOREIGN KEY (refund_request_id) REFERENCES refund_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE wechat_bill_reconciliations (
      id varchar(64) NOT NULL,
      bill_date date NOT NULL,
      content_hash char(64) NOT NULL,
      difference_count int unsigned NOT NULL,
      confirmed_note text NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_wechat_bill_reconciliations_date (bill_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE wechat_bill_differences (
      id varchar(64) NOT NULL,
      reconciliation_id varchar(64) NOT NULL,
      kind varchar(32) NOT NULL,
      out_trade_no varchar(32) NOT NULL,
      out_refund_no varchar(32) NULL,
      wechat_amount_fen int unsigned NULL,
      local_amount_fen int unsigned NULL,
      wechat_refund_fen int unsigned NULL,
      local_refund_fen int unsigned NULL,
      summary text NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      KEY idx_wechat_bill_differences_reconciliation (reconciliation_id),
      CONSTRAINT fk_wechat_bill_differences_reconciliation FOREIGN KEY (reconciliation_id) REFERENCES wechat_bill_reconciliations(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE wechat_bill_differences")
    await queryRunner.query("DROP TABLE wechat_bill_reconciliations")
    await queryRunner.query("DROP TABLE wechat_transactions")
    await queryRunner.query("DROP TABLE wechat_family_sessions")
  }
}
