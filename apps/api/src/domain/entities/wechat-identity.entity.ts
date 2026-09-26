import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "wechat_identities" })
@Index("uq_wechat_identities_family_code", ["familyCode"], { unique: true })
export class WechatIdentityEntity {
  @PrimaryColumn({ name: "openid_hash", type: "char", length: 64 })
  openidHash = ""

  @Column({ name: "family_code", type: "varchar", length: 64 })
  familyCode = ""
}
