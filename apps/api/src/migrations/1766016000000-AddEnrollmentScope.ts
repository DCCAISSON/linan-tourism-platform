import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddEnrollmentScope1766016000000 implements MigrationInterface {
  readonly name = "AddEnrollmentScope1766016000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tour_sessions ADD enrollment_scope_json json NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tour_sessions DROP COLUMN enrollment_scope_json")
  }
}
