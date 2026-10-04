import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddEvaluationDimensions1766001600000 implements MigrationInterface {
  name = "AddEvaluationDimensions1766001600000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE evaluation_standards ADD COLUMN dimensions json NULL")
    await queryRunner.query("ALTER TABLE student_evaluations ADD COLUMN dimension_observations json NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE student_evaluations DROP COLUMN dimension_observations")
    await queryRunner.query("ALTER TABLE evaluation_standards DROP COLUMN dimensions")
  }
}
