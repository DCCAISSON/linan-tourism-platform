import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddCatalogContentTemplates1766021000000 implements MigrationInterface {
  readonly name = "AddCatalogContentTemplates1766021000000"

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE catalog_content_templates (
      id varchar(64) NOT NULL,
      title varchar(160) NOT NULL,
      description varchar(4000) NOT NULL DEFAULT '',
      cover_image_url varchar(2048) NOT NULL DEFAULT '',
      version int UNSIGNED NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB`)
    await runner.query(`ALTER TABLE catalog_items
      ADD template_id varchar(64) NULL,
      ADD INDEX idx_catalog_items_template (template_id),
      ADD CONSTRAINT fk_catalog_items_content_template FOREIGN KEY (template_id)
        REFERENCES catalog_content_templates(id) ON DELETE RESTRICT ON UPDATE CASCADE`)
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE catalog_items
      DROP FOREIGN KEY fk_catalog_items_content_template,
      DROP INDEX idx_catalog_items_template,
      DROP COLUMN template_id`)
    await runner.query("DROP TABLE catalog_content_templates")
  }
}
