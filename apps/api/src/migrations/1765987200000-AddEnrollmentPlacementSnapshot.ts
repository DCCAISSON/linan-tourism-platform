import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddEnrollmentPlacementSnapshot1765987200000 implements MigrationInterface {
  readonly name = "AddEnrollmentPlacementSnapshot1765987200000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE enrollment_participants ADD grade_id_snapshot varchar(64) NULL, ADD class_id_snapshot varchar(64) NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE enrollment_participants DROP COLUMN class_id_snapshot, DROP COLUMN grade_id_snapshot")
  }
}
