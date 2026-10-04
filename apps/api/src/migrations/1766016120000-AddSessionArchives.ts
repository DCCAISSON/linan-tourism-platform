import type { MigrationInterface, QueryRunner } from "typeorm"
export class AddSessionArchives1766016120000 implements MigrationInterface {
  readonly name = "AddSessionArchives1766016120000"
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE session_archives (
      id varchar(64) PRIMARY KEY, tour_session_id varchar(64) NOT NULL, organization_id varchar(64) NOT NULL,
      version int unsigned NOT NULL, created_by varchar(64) NOT NULL, creator_name varchar(120) NOT NULL,
      session_code varchar(64) NOT NULL, sections_json json NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_session_archive_version(tour_session_id, version),
      FOREIGN KEY(tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT,
      FOREIGN KEY(created_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
  async down(runner: QueryRunner): Promise<void> { await runner.query("DROP TABLE session_archives") }
}
