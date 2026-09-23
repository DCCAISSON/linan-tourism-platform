import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddMediaSchema1765958400000 implements MigrationInterface {
  name = "AddMediaSchema1765958400000"
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE media_assets (
      id varchar(64) NOT NULL PRIMARY KEY,
      tour_session_id varchar(64) NOT NULL,
      author_staff_id varchar(64) NOT NULL,
      request_id varchar(36) NOT NULL,
      content_hash varchar(64) NOT NULL,
      object_key varchar(255) NOT NULL,
      title varchar(120) NOT NULL,
      kind varchar(16) NOT NULL,
      content_type varchar(64) NOT NULL,
      byte_size int unsigned NOT NULL,
      status varchar(16) NOT NULL,
      version int unsigned NOT NULL DEFAULT 1,
      cleanup_pending tinyint NOT NULL DEFAULT 0,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_media_assets_request (tour_session_id, request_id),
      KEY idx_media_assets_session_status (tour_session_id, status),
      CONSTRAINT fk_media_assets_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_media_assets_author FOREIGN KEY (author_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`)
    await queryRunner.query(`CREATE TABLE media_providers (
      id varchar(64) NOT NULL PRIMARY KEY,
      tour_session_id varchar(64) NOT NULL,
      updated_by_staff_id varchar(64) NOT NULL,
      kind varchar(16) NOT NULL,
      label varchar(80) NOT NULL,
      url varchar(2000) NOT NULL,
      enabled tinyint NOT NULL DEFAULT 0,
      version int unsigned NOT NULL DEFAULT 1,
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_media_providers_session_kind (tour_session_id, kind),
      CONSTRAINT fk_media_providers_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_media_providers_author FOREIGN KEY (updated_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`)
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE media_providers")
    await queryRunner.query("DROP TABLE media_assets")
  }
}
