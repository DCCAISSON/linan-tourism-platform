import { describe, expect, it } from "vitest"

import { RosterApiError } from "@/api/roster"
import { parseRosterSummary } from "@/api/roster.parsers"

describe("roster summary parser", () => {
  it("parses paid totals and participant rows when the API returns the roster payload", () => {
    const summary = parseRosterSummary({
      filters: {
        tourSessionId: "session-1",
        schoolId: "school-1",
        gradeId: "grade-1",
        classId: "class-1",
      },
      paidHeadcount: 2,
      paidAmountFen: 25600,
      rows: [
        {
          participantId: "participant-1",
          displayName: "张三",
          schoolId: "school-1",
          schoolName: "临安实验小学",
          gradeId: "grade-1",
          gradeName: "一年级",
          classId: "class-1",
          className: "一班",
          amountFen: 12800,
        },
      ],
    })

    expect(summary.paidHeadcount).toBe(2)
    expect(summary.paidAmountFen).toBe(25600)
    expect(summary.filters).toEqual({
      tourSessionId: "session-1",
      schoolId: "school-1",
      gradeId: "grade-1",
      classId: "class-1",
    })
    expect(summary.rows).toEqual([
      {
        participantId: "participant-1",
        displayName: "张三",
        schoolId: "school-1",
        schoolName: "临安实验小学",
        gradeId: "grade-1",
        gradeName: "一年级",
        classId: "class-1",
        className: "一班",
        amountFen: 12800,
      },
    ])
  })

  it("throws a typed parser error when rows is not an array", () => {
    expect(() =>
      parseRosterSummary({
        filters: {
          tourSessionId: "session-1",
        },
        paidHeadcount: 0,
        paidAmountFen: 0,
        rows: {},
      }),
    ).toThrow(RosterApiError)
  })

  it("accepts omitted filters and nullable grade and class fields", () => {
    const summary = parseRosterSummary({
      filters: {
        tourSessionId: "session-1",
        schoolId: "school-1",
        gradeId: null,
        classId: null,
      },
      paidHeadcount: 1,
      paidAmountFen: 12800,
      rows: [
        {
          participantId: "participant-1",
          displayName: "张三",
          schoolId: "school-1",
          schoolName: "临安实验小学",
          gradeId: null,
          gradeName: null,
          classId: null,
          className: null,
          amountFen: 12800,
        },
      ],
    })

    expect(summary.filters).toEqual({ tourSessionId: "session-1", schoolId: "school-1" })
    expect(summary.rows[0]?.gradeName).toBeNull()
    expect(summary.rows[0]?.className).toBeNull()
  })
})
