import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddNoticeVersions1765926000000 implements MigrationInterface {
  readonly name = "AddNoticeVersions1765926000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notice_versions (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        version varchar(64) NOT NULL,
        title varchar(255) NOT NULL,
        content_json json NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_notice_versions_session_version (tour_session_id, version),
        KEY idx_notice_versions_organization (organization_id),
        CONSTRAINT fk_notice_versions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_notice_versions_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query("ALTER TABLE tour_sessions ADD active_notice_id varchar(64) NULL AFTER enrollment_closes_at")
    await queryRunner.query("ALTER TABLE tour_sessions ADD KEY idx_tour_sessions_active_notice (active_notice_id)")
    await queryRunner.query("ALTER TABLE tour_sessions ADD CONSTRAINT fk_tour_sessions_active_notice FOREIGN KEY (active_notice_id) REFERENCES notice_versions(id) ON DELETE SET NULL ON UPDATE CASCADE")
    await queryRunner.query("ALTER TABLE consent_records ADD notice_version_id varchar(64) NULL AFTER schema_version")
    await queryRunner.query("ALTER TABLE consent_records ADD notice_version varchar(64) NULL AFTER notice_version_id")
    await queryRunner.query("ALTER TABLE consent_records ADD KEY idx_consent_records_notice_version (notice_version_id)")
    await queryRunner.query("ALTER TABLE consent_records ADD CONSTRAINT fk_consent_records_notice_version FOREIGN KEY (notice_version_id) REFERENCES notice_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE consent_records DROP FOREIGN KEY fk_consent_records_notice_version")
    await queryRunner.query("ALTER TABLE consent_records DROP KEY idx_consent_records_notice_version")
    await queryRunner.query("ALTER TABLE consent_records DROP COLUMN notice_version")
    await queryRunner.query("ALTER TABLE consent_records DROP COLUMN notice_version_id")
    await queryRunner.query("ALTER TABLE tour_sessions DROP FOREIGN KEY fk_tour_sessions_active_notice")
    await queryRunner.query("ALTER TABLE tour_sessions DROP KEY idx_tour_sessions_active_notice")
    await queryRunner.query("ALTER TABLE tour_sessions DROP COLUMN active_notice_id")
    await queryRunner.query("DROP TABLE notice_versions")
  }
}
