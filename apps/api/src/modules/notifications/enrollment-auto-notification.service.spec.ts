import { describe, expect, it } from "vitest"
import type { UserTemplateField } from "../../domain/entities/user-notification.entity.js"
import { enrollmentTemplatePayload, isEnrollmentNotificationTemplate } from "./enrollment-auto-notification.service.js"

const fields: readonly UserTemplateField[] = [
  { key: "thing4", label: "活动名称", rule: "thing" },
  { key: "number7", label: "报名人数", rule: "number" },
  { key: "time2", label: "活动时间", rule: "time" },
]

const reservationSuccessFields: readonly UserTemplateField[] = [
  { key: "thing5", label: "线路名", rule: "thing" },
  { key: "number4", label: "人数", rule: "number" },
  { key: "time1", label: "预约时间", rule: "time" },
]

describe("enrollment auto notification template", () => {
  it("accepts only the exact three-field enrollment semantic contract", () => {
    expect(isEnrollmentNotificationTemplate(fields)).toBe(true)
    expect(isEnrollmentNotificationTemplate([
      { key: "thing4", label: "活动地点", rule: "thing" },
      { key: "number7", label: "报名人数", rule: "number" },
      { key: "time2", label: "活动时间", rule: "time" },
    ])).toBe(false)
    expect(isEnrollmentNotificationTemplate([
      ...fields,
      { key: "thing9", label: "备注", rule: "thing" },
    ])).toBe(false)
  })

  it("uses the configured keys instead of assuming WeChat field numbers", () => {
    expect(enrollmentTemplatePayload(fields, {
      activityTitle: "临安秋日研学",
      participantCount: 2,
      startsAt: new Date("2026-10-02T01:30:00.000Z"),
    })).toEqual({
      thing4: "临安秋日研学",
      number7: "2",
      time2: "2026-10-02 09:30",
    })
  })

  it("accepts the configured reservation-success template as one complete field contract", () => {
    expect(isEnrollmentNotificationTemplate(reservationSuccessFields)).toBe(true)
    expect(isEnrollmentNotificationTemplate([
      { key: "thing5", label: "线路名", rule: "thing" },
      { key: "number7", label: "报名人数", rule: "number" },
      { key: "time1", label: "预约时间", rule: "time" },
    ])).toBe(false)
    expect(enrollmentTemplatePayload(reservationSuccessFields, {
      activityTitle: "临安秋日研学",
      participantCount: 2,
      startsAt: new Date("2026-10-02T01:30:00.000Z"),
    })).toEqual({
      thing5: "临安秋日研学",
      number4: "2",
      time1: "2026-10-02 09:30",
    })
  })

  it("formats time in China and truncates a thing field by code point", () => {
    expect(enrollmentTemplatePayload(fields, {
      activityTitle: "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥",
      participantCount: 2,
      startsAt: new Date("2026-10-02T01:30:00.000Z"),
    })).toMatchObject({
      thing4: "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉",
      time2: "2026-10-02 09:30",
    })
  })
})
