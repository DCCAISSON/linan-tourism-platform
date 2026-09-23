import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddNotifications1765976400000 implements MigrationInterface {
  readonly name = "AddNotifications1765976400000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE notification_content_versions (
      id varchar(64) NOT NULL PRIMARY KEY,
      organization_id varchar(64) NOT NULL,
      tour_session_id varchar(64) NOT NULL,
      title varchar(120) NOT NULL,
      body_text text NOT NULL,
      template_id varchar(128) NULL,
      miniapp_page varchar(255) NULL,
      template_data_json text NOT NULL,
      created_by_staff_id varchar(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      KEY idx_notification_content_versions_session (tour_session_id, created_at),
      KEY idx_notification_content_versions_organization (organization_id),
      CONSTRAINT fk_notification_contents_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_contents_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_contents_created_by FOREIGN KEY (created_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE notification_recipient_authorizations (
      id varchar(64) NOT NULL PRIMARY KEY,
      organization_id varchar(64) NOT NULL,
      order_id varchar(64) NOT NULL,
      family_actor_id varchar(128) NOT NULL,
      receiver_name varchar(120) NOT NULL,
      relation varchar(24) NOT NULL,
      channel varchar(24) NOT NULL,
      subscriber_openid varchar(128) NULL,
      active boolean NOT NULL DEFAULT true,
      revoked_at datetime(6) NULL,
      idempotency_key varchar(128) NOT NULL,
      version int unsigned NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_notification_authorizations_order_key (order_id, idempotency_key),
      KEY idx_notification_authorizations_order_active (order_id, active),
      KEY idx_notification_authorizations_organization (organization_id),
      CONSTRAINT fk_notification_authorizations_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_authorizations_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE notification_channel_entries (
      id varchar(64) NOT NULL PRIMARY KEY,
      tour_session_id varchar(64) NOT NULL,
      kind varchar(32) NOT NULL,
      label varchar(80) NOT NULL,
      url varchar(2000) NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      updated_by_staff_id varchar(64) NOT NULL,
      version int unsigned NOT NULL DEFAULT 1,
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_notification_channel_entries_session_kind (tour_session_id, kind),
      CONSTRAINT fk_notification_entries_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_entries_updated_by FOREIGN KEY (updated_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE notification_delivery_tasks (
      id varchar(64) NOT NULL PRIMARY KEY,
      organization_id varchar(64) NOT NULL,
      tour_session_id varchar(64) NOT NULL,
      content_version_id varchar(64) NOT NULL,
      created_by_staff_id varchar(64) NOT NULL,
      status varchar(24) NOT NULL,
      idempotency_key varchar(128) NOT NULL,
      request_fingerprint char(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_notification_tasks_session_key (tour_session_id, idempotency_key),
      KEY idx_notification_tasks_session (tour_session_id, created_at),
      CONSTRAINT fk_notification_tasks_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_tasks_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_tasks_content FOREIGN KEY (content_version_id) REFERENCES notification_content_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_tasks_created_by FOREIGN KEY (created_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE notification_delivery_targets (
      id varchar(64) NOT NULL PRIMARY KEY,
      task_id varchar(64) NOT NULL,
      authorization_id varchar(64) NOT NULL,
      authorization_version int unsigned NOT NULL,
      order_id varchar(64) NOT NULL,
      receiver_name varchar(120) NOT NULL,
      relation varchar(24) NOT NULL,
      channel varchar(24) NOT NULL,
      subscriber_openid varchar(128) NULL,
      status varchar(24) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_notification_targets_task_authorization (task_id, authorization_id),
      KEY idx_notification_targets_task_status (task_id, status),
      CONSTRAINT fk_notification_targets_task FOREIGN KEY (task_id) REFERENCES notification_delivery_tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_targets_authorization FOREIGN KEY (authorization_id) REFERENCES notification_recipient_authorizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_targets_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE notification_delivery_attempts (
      id varchar(64) NOT NULL PRIMARY KEY,
      task_id varchar(64) NOT NULL,
      target_id varchar(64) NOT NULL,
      attempt_number int unsigned NOT NULL,
      status varchar(24) NOT NULL,
      error_code varchar(64) NULL,
      provider_message varchar(255) NULL,
      accepted_at datetime(6) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_notification_attempts_target_number (target_id, attempt_number),
      KEY idx_notification_attempts_task (task_id, created_at),
      CONSTRAINT fk_notification_attempts_task FOREIGN KEY (task_id) REFERENCES notification_delivery_tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_notification_attempts_target FOREIGN KEY (target_id) REFERENCES notification_delivery_targets(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE notification_delivery_attempts")
    await queryRunner.query("DROP TABLE notification_delivery_targets")
    await queryRunner.query("DROP TABLE notification_delivery_tasks")
    await queryRunner.query("DROP TABLE notification_channel_entries")
    await queryRunner.query("DROP TABLE notification_recipient_authorizations")
    await queryRunner.query("DROP TABLE notification_content_versions")
  }
}
