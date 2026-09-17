import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddCatalogContent1765911600000 implements MigrationInterface {
  readonly name = "AddCatalogContent1765911600000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE catalog_items
        ADD description varchar(4000) NOT NULL DEFAULT '',
        ADD cover_image_url varchar(2048) NOT NULL DEFAULT ''
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE catalog_items DROP COLUMN cover_image_url, DROP COLUMN description")
  }
}
