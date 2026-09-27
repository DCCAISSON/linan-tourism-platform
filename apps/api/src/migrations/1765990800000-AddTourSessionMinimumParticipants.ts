import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddTourSessionMinimumParticipants1765990800000 implements MigrationInterface {
  readonly name = "AddTourSessionMinimumParticipants1765990800000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tour_sessions ADD minimum_participants int UNSIGNED NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tour_sessions DROP COLUMN minimum_participants")
  }
}
