import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddRecipientInvitations1766022000000 implements MigrationInterface {
  name = "AddRecipientInvitations1766022000000"
  async up(runner: QueryRunner): Promise<void> {
    await runner.query("ALTER TABLE notification_recipient_authorizations ADD COLUMN scope varchar(24) NOT NULL DEFAULT 'order', ADD COLUMN expires_at datetime(6) NULL")
    await runner.query("ALTER TABLE notification_channel_entries ADD COLUMN corp_id varchar(64) NULL")
    await runner.query(`CREATE TABLE notification_recipient_invites (
      id varchar(64) NOT NULL PRIMARY KEY, order_id varchar(64) NOT NULL, inviter_actor_id varchar(128) NOT NULL,
      token_hash char(64) NOT NULL, expires_at datetime(6) NOT NULL, authorization_deadline datetime(6) NOT NULL,
      authorization_id varchar(64) NULL, confirmed_at datetime(6) NULL, revoked_at datetime(6) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_recipient_invite_token (token_hash), UNIQUE KEY uq_recipient_invite_authorization (authorization_id),
      CONSTRAINT fk_recipient_invite_order FOREIGN KEY (order_id) REFERENCES orders(id),
      CONSTRAINT fk_recipient_invite_authorization FOREIGN KEY (authorization_id) REFERENCES notification_recipient_authorizations(id)
    ) ENGINE=InnoDB`)
    await runner.query(`CREATE TABLE recipient_template_consents (
      id varchar(64) NOT NULL PRIMARY KEY, authorization_id varchar(64) NOT NULL, template_id varchar(128) NOT NULL,
      status varchar(16) NOT NULL, version int unsigned NOT NULL DEFAULT 1,
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_recipient_template_consent (authorization_id, template_id),
      CONSTRAINT fk_recipient_consent_authorization FOREIGN KEY (authorization_id) REFERENCES notification_recipient_authorizations(id)
    ) ENGINE=InnoDB`)
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query("DROP TABLE recipient_template_consents")
    await runner.query("DROP TABLE notification_recipient_invites")
    await runner.query("ALTER TABLE notification_channel_entries DROP COLUMN corp_id")
    await runner.query("ALTER TABLE notification_recipient_authorizations DROP COLUMN scope, DROP COLUMN expires_at")
  }
}
