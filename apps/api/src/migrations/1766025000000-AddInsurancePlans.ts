import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddInsurancePlans1766025000000 implements MigrationInterface {
  readonly name = "AddInsurancePlans1766025000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tour_sessions ADD insurance_plan_json json NULL")
    await queryRunner.query("ALTER TABLE insurance_batches ADD plan_snapshot_json json NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE insurance_batches DROP COLUMN plan_snapshot_json")
    await queryRunner.query("ALTER TABLE tour_sessions DROP COLUMN insurance_plan_json")
  }
}
