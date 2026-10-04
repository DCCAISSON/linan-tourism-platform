import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddExecutionPersonDaily1765994400000 implements MigrationInterface {
  readonly name = "AddExecutionPersonDaily1765994400000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE execution_person_daily_reports (
      id varchar(64) NOT NULL,
      tour_session_id varchar(64) NOT NULL,
      person_ref varchar(128) NOT NULL,
      report_date varchar(10) NOT NULL,
      lodging_check text NOT NULL,
      meal_status text NOT NULL,
      encrypted_body_status text NOT NULL,
      encrypted_note text NOT NULL,
      key_version varchar(64) NOT NULL,
      public_summary text NOT NULL,
      public_approved boolean NOT NULL DEFAULT false,
      public_approved_by varchar(64) NULL,
      public_approved_at datetime(6) NULL,
      updated_by varchar(64) NOT NULL,
      version int NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_execution_person_daily_day (tour_session_id, person_ref, report_date),
      CONSTRAINT fk_execution_person_daily_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_execution_person_daily_updated FOREIGN KEY (updated_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_execution_person_daily_approved FOREIGN KEY (public_approved_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE execution_person_daily_reports")
  }
}
