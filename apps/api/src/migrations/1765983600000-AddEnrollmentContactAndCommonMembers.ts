import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddEnrollmentContactAndCommonMembers1765983600000 implements MigrationInterface {
  readonly name = "AddEnrollmentContactAndCommonMembers1765983600000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE enrollments ADD contact_phone varchar(32) NULL")
    await queryRunner.query("ALTER TABLE family_members ADD save_as_common boolean NOT NULL DEFAULT true")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE family_members DROP COLUMN save_as_common")
    await queryRunner.query("ALTER TABLE enrollments DROP COLUMN contact_phone")
  }
}
