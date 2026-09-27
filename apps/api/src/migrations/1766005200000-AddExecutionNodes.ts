import type { MigrationInterface, QueryRunner } from "typeorm"
export class AddExecutionNodes1766005200000 implements MigrationInterface {
  readonly name = "AddExecutionNodes1766005200000"
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE execution_plan_nodes (
      id varchar(64) PRIMARY KEY, tour_session_id varchar(64) NOT NULL, report_date varchar(10) NOT NULL,
      type varchar(16) NOT NULL, label varchar(100) NOT NULL, scheduled_time varchar(5) NULL,
      active boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 1, updated_by varchar(64) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_execution_node_session(tour_session_id,report_date),
      FOREIGN KEY(tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`CREATE TABLE execution_occurrences (
      id varchar(64) PRIMARY KEY, tour_session_id varchar(64) NOT NULL, root_id varchar(64) NOT NULL,
      node_id varchar(64) NULL, node_version int NULL, person_ref varchar(128) NOT NULL, vehicle_id varchar(64) NOT NULL,
      report_date varchar(10) NOT NULL, type varchar(16) NOT NULL, label varchar(100) NOT NULL,
      occurred_at datetime(6) NOT NULL, status varchar(20) NOT NULL, location varchar(200) NOT NULL, note text NOT NULL,
      corrects_id varchar(64) NULL, correction_reason varchar(500) NOT NULL, version int NOT NULL DEFAULT 1,
      recorded_by varchar(64) NOT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_execution_occurrence_revision(root_id,version), INDEX idx_execution_occurrence_session(tour_session_id,report_date),
      FOREIGN KEY(tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT,
      FOREIGN KEY(node_id) REFERENCES execution_plan_nodes(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`ALTER TABLE execution_person_daily_reports
      ADD breakfast varchar(20) NULL, ADD lunch varchar(20) NULL, ADD dinner varchar(20) NULL,
      ADD breakfast_note varchar(4000) NOT NULL DEFAULT '', ADD lunch_note varchar(4000) NOT NULL DEFAULT '', ADD dinner_note varchar(4000) NOT NULL DEFAULT ''`)
    await queryRunner.query(`CREATE TABLE execution_person_daily_revisions (
      id varchar(64) PRIMARY KEY, report_id varchar(64) NOT NULL, tour_session_id varchar(64) NOT NULL,
      person_ref varchar(128) NOT NULL, report_date varchar(10) NOT NULL, version int NOT NULL,
      recorded_by varchar(64) NOT NULL, correction_reason varchar(1000) NOT NULL, snapshot json NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_execution_daily_revision(report_id,version), INDEX idx_execution_daily_revision_session(tour_session_id),
      FOREIGN KEY(report_id) REFERENCES execution_person_daily_reports(id) ON DELETE RESTRICT,
      FOREIGN KEY(tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT,
      FOREIGN KEY(recorded_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE execution_person_daily_revisions")
    await queryRunner.query("ALTER TABLE execution_person_daily_reports DROP breakfast, DROP lunch, DROP dinner, DROP breakfast_note, DROP lunch_note, DROP dinner_note")
    await queryRunner.query("DROP TABLE execution_occurrences")
    await queryRunner.query("DROP TABLE execution_plan_nodes")
  }
}
