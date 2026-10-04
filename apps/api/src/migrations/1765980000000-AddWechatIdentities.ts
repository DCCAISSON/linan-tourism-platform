import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddWechatIdentities1765980000000 implements MigrationInterface {
  readonly name = "AddWechatIdentities1765980000000"

  async up(queryRunner: QueryRunner): Promise<void> {
    const conflicts: readonly unknown[] = await queryRunner.query(`
      SELECT 1 FROM wechat_family_sessions GROUP BY openid_hash HAVING COUNT(DISTINCT family_code) > 1
      UNION ALL
      SELECT 1 FROM wechat_family_sessions GROUP BY family_code HAVING COUNT(DISTINCT openid_hash) > 1`)
    if (conflicts.length > 0) throw new Error(`WeChat identity migration requires review: ${conflicts.length} conflicting historical mappings`)
    await queryRunner.query(`CREATE TABLE wechat_identities (
      openid_hash char(64) NOT NULL,
      family_code varchar(64) NOT NULL,
      PRIMARY KEY (openid_hash),
      UNIQUE KEY uq_wechat_identities_family_code (family_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await queryRunner.query(`INSERT INTO wechat_identities (openid_hash, family_code)
      SELECT openid_hash, MIN(family_code) FROM wechat_family_sessions GROUP BY openid_hash`)
    await queryRunner.query("ALTER TABLE wechat_family_sessions MODIFY organization_id varchar(64) NULL, MODIFY family_id varchar(64) NULL")
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const consumers: readonly unknown[] = await queryRunner.query("SELECT 1 FROM wechat_family_sessions WHERE organization_id IS NULL OR family_id IS NULL LIMIT 1")
    if (consumers.length > 0) throw new Error("Cannot revert WeChat identities while consumer sessions exist")
    await queryRunner.query("ALTER TABLE wechat_family_sessions MODIFY organization_id varchar(64) NOT NULL, MODIFY family_id varchar(64) NOT NULL")
    await queryRunner.query("DROP TABLE wechat_identities")
  }
}
