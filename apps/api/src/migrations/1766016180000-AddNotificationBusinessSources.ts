import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddNotificationBusinessSources1766016180000 implements MigrationInterface {
  name = "AddNotificationBusinessSources1766016180000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE notification_business_sources (
      id varchar(64) NOT NULL, kind varchar(32) NOT NULL, session_id varchar(64) NOT NULL,
      order_id varchar(64) NULL, source_version int unsigned NOT NULL,
      source_key varchar(160) NOT NULL, title varchar(120) NOT NULL, body_text text NOT NULL,
      linked_task_id varchar(64) NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_notification_source_key (source_key),
      UNIQUE KEY uq_notification_source_task (linked_task_id), KEY idx_notification_source_session (session_id),
      CONSTRAINT fk_notification_source_session FOREIGN KEY (session_id) REFERENCES tour_sessions(id),
      CONSTRAINT fk_notification_source_order FOREIGN KEY (order_id) REFERENCES orders(id),
      CONSTRAINT fk_notification_source_task FOREIGN KEY (linked_task_id) REFERENCES notification_delivery_tasks(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE notification_business_sources")
  }
}
