import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddPhoneAuthentication1766020000000 implements MigrationInterface {
  readonly name = "AddPhoneAuthentication1766020000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE wechat_family_sessions ADD phone_hash char(64) NULL, ADD phone_verified boolean NOT NULL DEFAULT false")
    await queryRunner.query("CREATE TABLE phone_identities (phone_hash char(64) NOT NULL, family_code varchar(64) NOT NULL, PRIMARY KEY (phone_hash)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
    await queryRunner.query("CREATE TABLE phone_sms_challenges (id varchar(64) NOT NULL, phone_hash char(64) NOT NULL, code_hash char(64) NOT NULL, attempt_count int unsigned NOT NULL DEFAULT 0, expires_at datetime(6) NOT NULL, consumed_at datetime(6) NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id), KEY idx_phone_sms_challenges_phone_created (phone_hash, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
    await queryRunner.query("CREATE TABLE phone_sms_rate_limits (phone_hash char(64) NOT NULL, last_sent_at datetime(6) NOT NULL, PRIMARY KEY (phone_hash)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
    await queryRunner.query("CREATE TABLE phone_sms_send_limits (limit_key char(64) NOT NULL, minute_started_at datetime(6) NOT NULL, minute_count int unsigned NOT NULL, day_started_at date NOT NULL, day_count int unsigned NOT NULL, PRIMARY KEY (limit_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE phone_sms_send_limits")
    await queryRunner.query("DROP TABLE phone_sms_rate_limits")
    await queryRunner.query("DROP TABLE phone_sms_challenges")
    await queryRunner.query("DROP TABLE phone_identities")
    await queryRunner.query("ALTER TABLE wechat_family_sessions DROP COLUMN phone_verified, DROP COLUMN phone_hash")
  }
}
