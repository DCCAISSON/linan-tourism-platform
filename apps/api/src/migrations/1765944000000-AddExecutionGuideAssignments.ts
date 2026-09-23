import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddExecutionGuideAssignments1765944000000 implements MigrationInterface {
  readonly name = "AddExecutionGuideAssignments1765944000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE execution_guide_assignments (
        id varchar(64) NOT NULL,
        staff_account_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        vehicle_id varchar(64) NULL,
        scope_key varchar(64) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        version int NOT NULL DEFAULT 1,
        reason varchar(500) NOT NULL,
        updated_by varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_execution_assignment (staff_account_id, tour_session_id, scope_key),
        KEY idx_execution_assignment_session (tour_session_id),
        KEY idx_execution_assignment_vehicle (vehicle_id),
        CONSTRAINT fk_execution_assignment_staff FOREIGN KEY (staff_account_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_assignment_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_assignment_vehicle FOREIGN KEY (vehicle_id) REFERENCES transport_session_vehicles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_assignment_updated_by FOREIGN KEY (updated_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE execution_attendance (
        id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        vehicle_id varchar(64) NOT NULL,
        person_ref varchar(128) NOT NULL,
        status varchar(16) NOT NULL,
        info_checked boolean NOT NULL DEFAULT false,
        group_joined boolean NOT NULL DEFAULT false,
        note varchar(500) NOT NULL,
        updated_by varchar(64) NOT NULL,
        version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_execution_attendance_person (tour_session_id, person_ref),
        KEY idx_execution_attendance_vehicle (vehicle_id),
        CONSTRAINT fk_execution_attendance_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_attendance_vehicle FOREIGN KEY (vehicle_id) REFERENCES transport_session_vehicles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_attendance_updated_by FOREIGN KEY (updated_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE execution_daily_reports (
        id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        report_date varchar(10) NOT NULL,
        lodging_check text NOT NULL,
        meal_status text NOT NULL,
        body_status text NOT NULL,
        note text NOT NULL,
        public_summary text NOT NULL,
        public_approved boolean NOT NULL DEFAULT false,
        public_approved_by varchar(64) NULL,
        public_approved_at datetime(6) NULL,
        updated_by varchar(64) NOT NULL,
        version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_execution_daily_report_day (tour_session_id, report_date),
        CONSTRAINT fk_execution_daily_report_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_daily_report_updated_by FOREIGN KEY (updated_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_daily_report_approved_by FOREIGN KEY (public_approved_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE execution_events (
        id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        person_ref varchar(128) NULL,
        category varchar(32) NOT NULL,
        occurred_at datetime(6) NOT NULL,
        content text NOT NULL,
        public_summary text NOT NULL,
        public_approved boolean NOT NULL DEFAULT false,
        public_approved_by varchar(64) NULL,
        public_approved_at datetime(6) NULL,
        created_by varchar(64) NOT NULL,
        updated_by varchar(64) NOT NULL,
        version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_execution_events_session (tour_session_id, occurred_at),
        KEY idx_execution_events_person (person_ref),
        CONSTRAINT fk_execution_events_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_events_created_by FOREIGN KEY (created_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_events_updated_by FOREIGN KEY (updated_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_events_approved_by FOREIGN KEY (public_approved_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE execution_health_authorizations (
        id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        person_ref varchar(128) NOT NULL,
        order_id varchar(64) NOT NULL,
        family_actor_id varchar(64) NOT NULL,
        encrypted_health_json text NOT NULL,
        key_version varchar(16) NOT NULL,
        version int NOT NULL DEFAULT 1,
        authorized_at datetime(6) NOT NULL,
        revoked_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_execution_health_authorization_person (tour_session_id, person_ref),
        KEY idx_execution_health_authorization_order (order_id),
        CONSTRAINT fk_execution_health_authorization_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_execution_health_authorization_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE execution_health_authorizations")
    await queryRunner.query("DROP TABLE execution_events")
    await queryRunner.query("DROP TABLE execution_daily_reports")
    await queryRunner.query("DROP TABLE execution_attendance")
    await queryRunner.query("DROP TABLE execution_guide_assignments")
  }
}
