import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddPretripWorkspace1765972800000 implements MigrationInterface {
  name = "AddPretripWorkspace1765972800000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE pretrip_configs (
      tour_session_id varchar(64) NOT NULL PRIMARY KEY,
      gathering_at datetime(6) NULL,
      gathering_place varchar(255) NOT NULL,
      travel_mode varchar(16) NOT NULL,
      itinerary_note text NOT NULL,
      contact_name varchar(80) NOT NULL,
      contact_phone varchar(40) NOT NULL,
      service_contact varchar(255) NOT NULL,
      notice_version_id varchar(64) NULL,
      updated_by_staff_id varchar(64) NOT NULL,
      version int unsigned NOT NULL DEFAULT 1,
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      CONSTRAINT fk_pretrip_configs_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_configs_updated_by FOREIGN KEY (updated_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`)
    await queryRunner.query(`CREATE TABLE pretrip_attachments (
      id varchar(64) NOT NULL PRIMARY KEY,
      tour_session_id varchar(64) NOT NULL,
      title varchar(120) NOT NULL,
      object_key varchar(255) NOT NULL,
      content_type varchar(80) NOT NULL,
      byte_size int unsigned NOT NULL,
      created_by_staff_id varchar(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      KEY idx_pretrip_attachments_session (tour_session_id),
      CONSTRAINT fk_pretrip_attachments_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_attachments_created_by FOREIGN KEY (created_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`)
    await queryRunner.query(`CREATE TABLE pretrip_school_confirmations (
      id varchar(64) NOT NULL PRIMARY KEY,
      tour_session_id varchar(64) NOT NULL,
      school_id varchar(64) NOT NULL,
      transport_confirmation_id varchar(64) NOT NULL,
      plan_version int unsigned NOT NULL,
      roster_version varchar(128) NOT NULL,
      status varchar(16) NOT NULL,
      signed_by_staff_id varchar(64) NOT NULL,
      signed_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      KEY idx_pretrip_school_confirmations_scope (tour_session_id, school_id, status),
      CONSTRAINT fk_pretrip_school_confirmations_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_school_confirmations_school FOREIGN KEY (school_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_school_confirmations_transport_confirmation FOREIGN KEY (transport_confirmation_id) REFERENCES transport_confirmations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_school_confirmations_signed_by FOREIGN KEY (signed_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`)
    await queryRunner.query(`CREATE TABLE pretrip_adjustment_requests (
      id varchar(64) NOT NULL PRIMARY KEY,
      tour_session_id varchar(64) NOT NULL,
      school_id varchar(64) NOT NULL,
      transport_confirmation_id varchar(64) NOT NULL,
      plan_version int unsigned NOT NULL,
      roster_version varchar(128) NOT NULL,
      kind varchar(24) NOT NULL,
      person_ref varchar(96) NULL,
      request_text text NOT NULL,
      status varchar(16) NOT NULL,
      requested_by_staff_id varchar(64) NOT NULL,
      response_text text NULL,
      processed_by_staff_id varchar(64) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      KEY idx_pretrip_adjustments_session_school (tour_session_id, school_id, status),
      CONSTRAINT fk_pretrip_adjustments_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_adjustments_school FOREIGN KEY (school_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_adjustments_transport_confirmation FOREIGN KEY (transport_confirmation_id) REFERENCES transport_confirmations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_pretrip_adjustments_requested_by FOREIGN KEY (requested_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE pretrip_adjustment_requests")
    await queryRunner.query("DROP TABLE pretrip_school_confirmations")
    await queryRunner.query("DROP TABLE pretrip_attachments")
    await queryRunner.query("DROP TABLE pretrip_configs")
  }
}
