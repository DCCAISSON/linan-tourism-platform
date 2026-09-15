import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddFamilyEnrollmentSchema1765904400000 implements MigrationInterface {
  readonly name = "AddFamilyEnrollmentSchema1765904400000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE families (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        primary_contact_name varchar(120) NOT NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_families_organization_code (organization_id, code),
        CONSTRAINT fk_families_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE family_members (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        family_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        display_name varchar(120) NOT NULL,
        grade_id varchar(64) NULL,
        class_id varchar(64) NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_family_members_family_code (family_id, code),
        KEY idx_family_members_organization (organization_id),
        KEY idx_family_members_grade (grade_id),
        KEY idx_family_members_class (class_id),
        CONSTRAINT fk_family_members_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_family_members_family FOREIGN KEY (family_id) REFERENCES families(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_family_members_grade FOREIGN KEY (grade_id) REFERENCES school_grades(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_family_members_class FOREIGN KEY (class_id) REFERENCES school_classes(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      ALTER TABLE enrollments
        ADD family_id varchar(64) NULL AFTER tour_session_id,
        ADD emergency_contact_name varchar(120) NULL AFTER contact_name,
        ADD emergency_contact_phone varchar(32) NULL AFTER emergency_contact_name,
        ADD KEY idx_enrollments_family (family_id),
        ADD CONSTRAINT fk_enrollments_family FOREIGN KEY (family_id) REFERENCES families(id) ON UPDATE CASCADE ON DELETE RESTRICT
    `)
    await queryRunner.query(`
      CREATE TABLE enrollment_participants (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        enrollment_id varchar(64) NOT NULL,
        family_id varchar(64) NOT NULL,
        family_member_id varchar(64) NOT NULL,
        display_name_snapshot varchar(120) NOT NULL,
        grade_name_snapshot varchar(120) NULL,
        class_name_snapshot varchar(120) NULL,
        policy_version varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_enrollment_participants_enrollment_member (enrollment_id, family_member_id),
        KEY idx_enrollment_participants_organization (organization_id),
        KEY idx_enrollment_participants_family (family_id),
        KEY idx_enrollment_participants_family_member (family_member_id),
        CONSTRAINT fk_enrollment_participants_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_enrollment_participants_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_enrollment_participants_family FOREIGN KEY (family_id) REFERENCES families(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_enrollment_participants_family_member FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      ALTER TABLE consent_records
        ADD family_id varchar(64) NULL AFTER organization_id,
        ADD KEY idx_consent_records_family (family_id),
        ADD CONSTRAINT fk_consent_records_family FOREIGN KEY (family_id) REFERENCES families(id) ON UPDATE CASCADE ON DELETE RESTRICT
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE consent_records DROP FOREIGN KEY fk_consent_records_family")
    await queryRunner.query("ALTER TABLE consent_records DROP KEY idx_consent_records_family")
    await queryRunner.query("ALTER TABLE consent_records DROP COLUMN family_id")
    await queryRunner.query("DROP TABLE enrollment_participants")
    await queryRunner.query("ALTER TABLE enrollments DROP FOREIGN KEY fk_enrollments_family")
    await queryRunner.query("ALTER TABLE enrollments DROP KEY idx_enrollments_family")
    await queryRunner.query(
      "ALTER TABLE enrollments DROP COLUMN emergency_contact_phone, DROP COLUMN emergency_contact_name, DROP COLUMN family_id",
    )
    await queryRunner.query("DROP TABLE family_members")
    await queryRunner.query("DROP TABLE families")
  }
}
