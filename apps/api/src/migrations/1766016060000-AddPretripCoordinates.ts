import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddPretripCoordinates1766016060000 implements MigrationInterface {
  name = "AddPretripCoordinates1766016060000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE pretrip_configs ADD gathering_latitude double NULL, ADD gathering_longitude double NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE pretrip_configs DROP COLUMN gathering_longitude, DROP COLUMN gathering_latitude")
  }
}
