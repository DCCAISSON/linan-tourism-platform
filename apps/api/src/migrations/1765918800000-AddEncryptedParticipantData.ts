import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddEncryptedParticipantData1765918800000 implements MigrationInterface {
  readonly name = "AddEncryptedParticipantData1765918800000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE family_members
        ADD participant_kind varchar(16) NOT NULL DEFAULT 'student' AFTER display_name,
        ADD identity_ciphertext text NULL AFTER class_id,
        ADD identity_hash char(64) NULL AFTER identity_ciphertext,
        ADD identity_masked varchar(64) NULL AFTER identity_hash,
        ADD phone_ciphertext text NULL AFTER identity_masked,
        ADD phone_hash char(64) NULL AFTER phone_ciphertext,
        ADD phone_masked varchar(32) NULL AFTER phone_hash,
        ADD person_data_key_version varchar(16) NOT NULL DEFAULT 'v1' AFTER phone_masked,
        ADD KEY idx_family_members_identity_hash (identity_hash)
    `)
    await queryRunner.query(`
      ALTER TABLE enrollment_participants
        ADD participant_kind_snapshot varchar(16) NOT NULL DEFAULT 'student' AFTER display_name_snapshot,
        ADD identity_ciphertext_snapshot text NULL AFTER class_name_snapshot,
        ADD identity_hash_snapshot char(64) NULL AFTER identity_ciphertext_snapshot,
        ADD identity_masked_snapshot varchar(64) NULL AFTER identity_hash_snapshot,
        ADD phone_ciphertext_snapshot text NULL AFTER identity_masked_snapshot,
        ADD phone_hash_snapshot char(64) NULL AFTER phone_ciphertext_snapshot,
        ADD phone_masked_snapshot varchar(32) NULL AFTER phone_hash_snapshot,
        ADD person_data_key_version_snapshot varchar(16) NOT NULL DEFAULT 'v1' AFTER phone_masked_snapshot,
        ADD KEY idx_enrollment_participants_identity_hash (identity_hash_snapshot)
    `)
    await queryRunner.query(`
      ALTER TABLE order_lines
        ADD participant_kind_snapshot varchar(16) NOT NULL DEFAULT 'student' AFTER display_name_snapshot,
        ADD identity_ciphertext_snapshot text NULL AFTER class_name_snapshot,
        ADD identity_hash_snapshot char(64) NULL AFTER identity_ciphertext_snapshot,
        ADD identity_masked_snapshot varchar(64) NULL AFTER identity_hash_snapshot,
        ADD phone_ciphertext_snapshot text NULL AFTER identity_masked_snapshot,
        ADD phone_hash_snapshot char(64) NULL AFTER phone_ciphertext_snapshot,
        ADD phone_masked_snapshot varchar(32) NULL AFTER phone_hash_snapshot,
        ADD person_data_key_version_snapshot varchar(16) NOT NULL DEFAULT 'v1' AFTER phone_masked_snapshot,
        ADD KEY idx_order_lines_identity_hash (identity_hash_snapshot)
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE order_lines DROP KEY idx_order_lines_identity_hash")
    await queryRunner.query(`
      ALTER TABLE order_lines
        DROP COLUMN person_data_key_version_snapshot,
        DROP COLUMN phone_masked_snapshot,
        DROP COLUMN phone_hash_snapshot,
        DROP COLUMN phone_ciphertext_snapshot,
        DROP COLUMN identity_masked_snapshot,
        DROP COLUMN identity_hash_snapshot,
        DROP COLUMN identity_ciphertext_snapshot,
        DROP COLUMN participant_kind_snapshot
    `)
    await queryRunner.query("ALTER TABLE enrollment_participants DROP KEY idx_enrollment_participants_identity_hash")
    await queryRunner.query(`
      ALTER TABLE enrollment_participants
        DROP COLUMN person_data_key_version_snapshot,
        DROP COLUMN phone_masked_snapshot,
        DROP COLUMN phone_hash_snapshot,
        DROP COLUMN phone_ciphertext_snapshot,
        DROP COLUMN identity_masked_snapshot,
        DROP COLUMN identity_hash_snapshot,
        DROP COLUMN identity_ciphertext_snapshot,
        DROP COLUMN participant_kind_snapshot
    `)
    await queryRunner.query("ALTER TABLE family_members DROP KEY idx_family_members_identity_hash")
    await queryRunner.query(`
      ALTER TABLE family_members
        DROP COLUMN person_data_key_version,
        DROP COLUMN phone_masked,
        DROP COLUMN phone_hash,
        DROP COLUMN phone_ciphertext,
        DROP COLUMN identity_masked,
        DROP COLUMN identity_hash,
        DROP COLUMN identity_ciphertext,
        DROP COLUMN participant_kind
    `)
  }
}
