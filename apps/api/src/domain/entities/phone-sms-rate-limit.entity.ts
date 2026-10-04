import { Column, Entity, PrimaryColumn } from "typeorm"

@Entity({ name: "phone_sms_rate_limits" })
export class PhoneSmsRateLimitEntity {
  @PrimaryColumn({ name: "phone_hash", type: "char", length: 64 })
  phoneHash = ""

  @Column({ name: "last_sent_at", type: "datetime", precision: 6 })
  lastSentAt = new Date(0)
}
