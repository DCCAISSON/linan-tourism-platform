import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddTravelerEligibility1765936800000 implements MigrationInterface {
  readonly name = "AddTravelerEligibility1765936800000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE roster_import_people
      ADD status varchar(16) NOT NULL DEFAULT 'active',
      ADD version int unsigned NOT NULL DEFAULT 1,
      ADD eligibility_status varchar(16) NOT NULL DEFAULT 'pending',
      ADD eligibility_reason varchar(500) NULL`)
    await queryRunner.query(`CREATE TABLE traveler_import_changes (
      id varchar(64) NOT NULL, import_person_id varchar(64) NOT NULL, actor_id varchar(64) NOT NULL,
      action varchar(16) NOT NULL, reason varchar(500) NOT NULL,
      before_values json NOT NULL, after_values json NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), KEY idx_traveler_import_changes_person (import_person_id),
      CONSTRAINT fk_traveler_import_changes_person FOREIGN KEY (import_person_id)
        REFERENCES roster_import_people(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE traveler_import_changes")
    await queryRunner.query("ALTER TABLE roster_import_people DROP COLUMN eligibility_reason, DROP COLUMN eligibility_status, DROP COLUMN version, DROP COLUMN status")
  }
}
