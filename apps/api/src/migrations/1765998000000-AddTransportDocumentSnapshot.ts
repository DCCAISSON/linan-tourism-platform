import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddTransportDocumentSnapshot1765998000000 implements MigrationInterface {
  name = "AddTransportDocumentSnapshot1765998000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE transport_plans ADD COLUMN document_snapshot_json JSON NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE transport_plans DROP COLUMN document_snapshot_json")
  }
}
