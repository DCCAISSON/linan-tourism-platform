import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddRosterImports1765922400000 implements MigrationInterface {
  readonly name = "AddRosterImports1765922400000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE roster_import_batches (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        grade_id varchar(64) NULL,
        class_id varchar(64) NULL,
        source_template varchar(32) NOT NULL,
        file_name varchar(255) NOT NULL,
        created_by varchar(64) NOT NULL,
        total_rows int unsigned NOT NULL DEFAULT 0,
        imported_count int unsigned NOT NULL DEFAULT 0,
        duplicate_count int unsigned NOT NULL DEFAULT 0,
        error_count int unsigned NOT NULL DEFAULT 0,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_roster_import_batches_session (tour_session_id),
        KEY idx_roster_import_batches_organization (organization_id),
        CONSTRAINT fk_roster_import_batches_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_roster_import_batches_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_roster_import_batches_grade FOREIGN KEY (grade_id) REFERENCES school_grades(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_roster_import_batches_class FOREIGN KEY (class_id) REFERENCES school_classes(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE roster_import_people (
        id varchar(64) NOT NULL,
        batch_id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        grade_id varchar(64) NULL,
        class_id varchar(64) NULL,
        source_row_number int unsigned NOT NULL,
        source_class_name varchar(120) NOT NULL,
        role varchar(16) NOT NULL,
        display_name varchar(120) NOT NULL,
        identity_ciphertext text NOT NULL,
        identity_hash char(64) NOT NULL,
        identity_masked varchar(64) NOT NULL,
        phone_ciphertext text NULL,
        phone_hash char(64) NULL,
        phone_masked varchar(32) NULL,
        person_data_key_version varchar(16) NOT NULL,
        created_by varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_roster_import_people_session_identity (tour_session_id, identity_hash),
        KEY idx_roster_import_people_batch (batch_id),
        KEY idx_roster_import_people_scope (organization_id, grade_id, class_id),
        CONSTRAINT fk_roster_import_people_batch FOREIGN KEY (batch_id) REFERENCES roster_import_batches(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_roster_import_people_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_roster_import_people_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_roster_import_people_grade FOREIGN KEY (grade_id) REFERENCES school_grades(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_roster_import_people_class FOREIGN KEY (class_id) REFERENCES school_classes(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE roster_import_errors (
        id varchar(64) NOT NULL,
        batch_id varchar(64) NOT NULL,
        source_row_number int unsigned NOT NULL,
        role varchar(16) NULL,
        field varchar(64) NOT NULL,
        message varchar(255) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_roster_import_errors_batch (batch_id),
        CONSTRAINT fk_roster_import_errors_batch FOREIGN KEY (batch_id) REFERENCES roster_import_batches(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE roster_import_errors")
    await queryRunner.query("DROP TABLE roster_import_people")
    await queryRunner.query("DROP TABLE roster_import_batches")
  }
}
