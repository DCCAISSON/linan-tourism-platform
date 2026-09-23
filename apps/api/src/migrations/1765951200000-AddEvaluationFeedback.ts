import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddEvaluationFeedback1765951200000 implements MigrationInterface {
  name = "AddEvaluationFeedback1765951200000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE evaluation_standards (
      id varchar(64) NOT NULL,
      tour_session_id varchar(64) NOT NULL,
      title varchar(120) NOT NULL,
      items json NOT NULL,
      public_format_note varchar(160) NOT NULL,
      created_by_staff_id varchar(64) NOT NULL,
      confirmed_at datetime(6) NULL,
      confirmed_by_staff_id varchar(64) NULL,
      version int unsigned NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      KEY idx_evaluation_standards_session (tour_session_id),
      CONSTRAINT fk_evaluation_standards_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_evaluation_standards_author FOREIGN KEY (created_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`)
    await queryRunner.query(`CREATE TABLE student_evaluations (
      id varchar(64) NOT NULL,
      tour_session_id varchar(64) NOT NULL,
      organization_id varchar(64) NOT NULL,
      person_ref varchar(80) NOT NULL,
      display_name varchar(120) NOT NULL,
      grade_name varchar(120) NULL,
      class_name varchar(120) NULL,
      standard_id varchar(64) NULL,
      standard_version int unsigned NULL,
      grade_code varchar(8) NULL,
      grade_label varchar(80) NULL,
      internal_comment varchar(500) NOT NULL,
      excellent boolean NOT NULL DEFAULT false,
      attention boolean NOT NULL DEFAULT false,
      idempotency_key varchar(80) NOT NULL,
      updated_by_staff_id varchar(64) NOT NULL,
      confirmed_at datetime(6) NULL,
      confirmed_by_staff_id varchar(64) NULL,
      version int unsigned NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_student_evaluations_person (tour_session_id, person_ref),
      KEY idx_student_evaluations_school (organization_id, confirmed_at),
      CONSTRAINT fk_student_evaluations_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_student_evaluations_standard FOREIGN KEY (standard_id) REFERENCES evaluation_standards(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_student_evaluations_author FOREIGN KEY (updated_by_staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`)
    await queryRunner.query(`CREATE TABLE service_feedback (
      id varchar(64) NOT NULL,
      tour_session_id varchar(64) NOT NULL,
      organization_id varchar(64) NOT NULL,
      order_id varchar(64) NULL,
      source varchar(16) NOT NULL,
      rating tinyint unsigned NOT NULL,
      content varchar(1000) NOT NULL,
      contact_name varchar(80) NOT NULL,
      allow_public boolean NOT NULL DEFAULT false,
      status varchar(16) NOT NULL,
      public_excerpt varchar(240) NOT NULL,
      idempotency_key varchar(80) NOT NULL,
      reviewed_by_staff_id varchar(64) NULL,
      reviewed_at datetime(6) NULL,
      version int unsigned NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_service_feedback_request (tour_session_id, source, idempotency_key),
      KEY idx_service_feedback_session_status (tour_session_id, status),
      CONSTRAINT fk_service_feedback_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE service_feedback")
    await queryRunner.query("DROP TABLE student_evaluations")
    await queryRunner.query("DROP TABLE evaluation_standards")
  }
}
