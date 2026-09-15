import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddSchoolCatalogSchema1765900800000 implements MigrationInterface {
  readonly name = "AddSchoolCatalogSchema1765900800000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE school_grades (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_school_grades_organization_code (organization_id, code),
        CONSTRAINT fk_school_grades_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE school_classes (
        id varchar(64) NOT NULL,
        grade_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_school_classes_grade_code (grade_id, code),
        CONSTRAINT fk_school_classes_grade FOREIGN KEY (grade_id) REFERENCES school_grades(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      ALTER TABLE tour_sessions
        ADD enrollment_opens_at datetime(6) NULL,
        ADD enrollment_closes_at datetime(6) NULL
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tour_sessions DROP COLUMN enrollment_closes_at, DROP COLUMN enrollment_opens_at")
    await queryRunner.query("DROP TABLE school_classes")
    await queryRunner.query("DROP TABLE school_grades")
  }
}
