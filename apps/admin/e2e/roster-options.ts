import type { Page } from "@playwright/test"

export async function installRosterOptions(page: Page): Promise<void> {
  const apiBase = "http://127.0.0.1:3000"
  const collections = {
    "/schools": [
      { id: "school-1", name: "临安实验小学", code: "test-school-1" },
      { id: "school-2", name: "第二测试学校", code: "test-school-2" },
    ],
    "/catalog-items": [{ id: "course-1", title: "临安山水研学", organizationId: "school-1", code: "course", policyVersion: "v1" }],
    "/tour-sessions": ["session-1", "session-2"].map(id => ({
      id, organizationId: "school-1", catalogItemId: "course-1", code: id,
      startsAt: "2026-09-20T00:00:00.000Z", endsAt: "2026-09-20T08:00:00.000Z",
      enrollmentOpensAt: "2026-09-01T00:00:00.000Z", enrollmentClosesAt: "2026-09-19T00:00:00.000Z",
      priceFen: 12800, capacity: 40, status: "published", policyVersion: "v1",
    })),
    "/schools/school-1/grades": [{ id: "grade-1", name: "一年级", code: "grade", organizationId: "school-1" }],
    "/schools/school-2/grades": [],
    "/grades/grade-1/classes": [{ id: "class-1", name: "一班", code: "class", gradeId: "grade-1" }],
  }
  await Promise.all(Object.entries(collections).map(([path, json]) => page.route(`${apiBase}${path}`, route => route.fulfill({ json }))))
}
