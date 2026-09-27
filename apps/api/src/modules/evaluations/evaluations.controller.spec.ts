import { Test } from "@nestjs/testing"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { createSchoolEvaluationWorkbook, createSchoolEvaluationWordXml } from "./evaluation-report.js"
import { EvaluationsController } from "./evaluations.controller.js"
import { EvaluationsService } from "./evaluations.service.js"

describe("evaluation report HTTP delivery", () => {
  it.each(["xlsx", "wordxml"])("delivers a generated %s report with valid HTTP headers", async (format) => {
    // Given: real report bytes with Chinese format labels at the controller boundary.
    const body = format === "xlsx" ? await createSchoolEvaluationWorkbook([]) : createSchoolEvaluationWordXml([], { title: "研学评价报告", templateNote: "基础格式" })
    const module = await Test.createTestingModule({
      controllers: [EvaluationsController],
      providers: [
        { provide: DevStaffAccessService, useValue: { resolve: async () => ({}) } },
        { provide: EvaluationsService, useValue: { schoolReport: async () => ({ filename: `report.${format === "xlsx" ? "xlsx" : "xml"}`, contentType: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/msword", body, formatLabel: format === "xlsx" ? "Excel 基础格式" : "Word XML 基础格式" }) } },
      ],
    }).compile()
    const app = module.createNestApplication()
    await app.init()
    try {
      // When: an HTTP client requests the report.
      const response = await request(app.getHttpServer()).get(`/evaluations/school/sessions/session-a/report?organizationId=school-a&format=${format}`)
      // Then: header serialization succeeds and the download keeps its real format.
      expect(response.status).toBe(200)
      expect(response.headers["x-linan-report-format"]).toBe(format)
      expect(response.headers["content-length"]).toBe(String(body.length))
    } finally { await app.close() }
  })
})
