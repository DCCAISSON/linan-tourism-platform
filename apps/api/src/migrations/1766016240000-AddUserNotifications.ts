import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddUserNotifications1766016240000 implements MigrationInterface {
  name = "AddUserNotifications1766016240000"
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE user_notification_templates (
      id varchar(64) NOT NULL PRIMARY KEY, title varchar(120) NOT NULL, category varchar(120) NOT NULL,
      template_id varchar(128) NOT NULL, type varchar(16) NOT NULL, fields json NOT NULL, enabled tinyint NOT NULL,
      updated_by varchar(64) NOT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_user_notification_template_wechat (template_id)
    ) ENGINE=InnoDB`)
    await runner.query(`CREATE TABLE user_notification_subscriptions (
      id varchar(64) NOT NULL PRIMARY KEY, actor_id varchar(64) NOT NULL, template_id varchar(64) NOT NULL,
      openid varchar(128) NOT NULL, status varchar(16) NOT NULL, version int unsigned NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_user_notification_actor_template (actor_id, template_id),
      CONSTRAINT fk_user_notification_subscription_template FOREIGN KEY (template_id) REFERENCES user_notification_templates(id)
    ) ENGINE=InnoDB`)
    await runner.query(`CREATE TABLE user_notification_tasks (
      id varchar(64) NOT NULL PRIMARY KEY, template_id varchar(64) NOT NULL, idempotency_key varchar(128) NOT NULL,
      request_fingerprint char(64) NOT NULL, payload_snapshot json NOT NULL, created_by varchar(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_user_notification_task_key (idempotency_key),
      CONSTRAINT fk_user_notification_task_template FOREIGN KEY (template_id) REFERENCES user_notification_templates(id)
    ) ENGINE=InnoDB`)
    await runner.query(`CREATE TABLE user_notification_targets (
      id varchar(64) NOT NULL PRIMARY KEY, task_id varchar(64) NOT NULL, subscription_id varchar(64) NOT NULL,
      subscription_version int unsigned NOT NULL, status varchar(24) NOT NULL,
      UNIQUE KEY uq_user_notification_target_subscription (task_id, subscription_id),
      CONSTRAINT fk_user_notification_target_task FOREIGN KEY (task_id) REFERENCES user_notification_tasks(id),
      CONSTRAINT fk_user_notification_target_subscription FOREIGN KEY (subscription_id) REFERENCES user_notification_subscriptions(id)
    ) ENGINE=InnoDB`)
    await runner.query(`CREATE TABLE user_notification_attempts (
      id varchar(64) NOT NULL PRIMARY KEY, task_id varchar(64) NOT NULL, target_id varchar(64) NOT NULL,
      sent_by varchar(64) NOT NULL, status varchar(24) NOT NULL, error_code varchar(64) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_user_notification_attempt_target (target_id),
      CONSTRAINT fk_user_notification_attempt_task FOREIGN KEY (task_id) REFERENCES user_notification_tasks(id),
      CONSTRAINT fk_user_notification_attempt_target FOREIGN KEY (target_id) REFERENCES user_notification_targets(id)
    ) ENGINE=InnoDB`)
  }
  async down(runner: QueryRunner): Promise<void> {
    for (const table of ["attempts", "targets", "tasks", "subscriptions", "templates"]) {
      await runner.query(`DROP TABLE user_notification_${table}`)
    }
  }
}
