import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddStaffIam1765915200000 implements MigrationInterface {
  readonly name = "AddStaffIam1765915200000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE staff_accounts (
        id varchar(64) NOT NULL,
        username varchar(80) NOT NULL,
        display_name varchar(80) NOT NULL,
        password_hash varchar(255) NOT NULL,
        status varchar(24) NOT NULL,
        force_password_change boolean NOT NULL DEFAULT true,
        failed_login_attempts int NOT NULL DEFAULT 0,
        locked_until datetime(6) NULL,
        expires_at datetime(6) NULL,
        permissions_version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY idx_staff_accounts_username (username)
      )
    `)
    await queryRunner.query(`
      CREATE TABLE staff_account_permissions (
        id varchar(80) NOT NULL,
        staff_account_id varchar(64) NOT NULL,
        permission_key varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY idx_staff_account_permissions_unique (staff_account_id, permission_key),
        KEY idx_staff_account_permissions_account (staff_account_id),
        CONSTRAINT fk_staff_account_permissions_account FOREIGN KEY (staff_account_id) REFERENCES staff_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE TABLE staff_account_scopes (
        id varchar(80) NOT NULL,
        staff_account_id varchar(64) NOT NULL,
        scope_kind varchar(32) NOT NULL,
        scope_id varchar(64) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_staff_account_scopes_account (staff_account_id),
        CONSTRAINT fk_staff_account_scopes_account FOREIGN KEY (staff_account_id) REFERENCES staff_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE TABLE staff_sessions (
        id varchar(80) NOT NULL,
        staff_account_id varchar(64) NOT NULL,
        token_hash char(64) NOT NULL,
        permissions_version int NOT NULL,
        expires_at datetime(6) NOT NULL,
        revoked_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY idx_staff_sessions_token_hash (token_hash),
        KEY idx_staff_sessions_account (staff_account_id),
        CONSTRAINT fk_staff_sessions_account FOREIGN KEY (staff_account_id) REFERENCES staff_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE staff_sessions")
    await queryRunner.query("DROP TABLE staff_account_scopes")
    await queryRunner.query("DROP TABLE staff_account_permissions")
    await queryRunner.query("DROP TABLE staff_accounts")
  }
}
