import { ConflictException, ForbiddenException } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { describe, expect, it, vi } from "vitest"
import { EvaluationStandardEntity } from "../../domain/entities/evaluation-standard.entity.js"
import { StudentEvaluationEntity } from "../../domain/entities/student-evaluation.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { EvaluationsService } from "./evaluations.service.js"
import { parseEvaluationRevision } from "./evaluations.parser.js"

const staff: StaffAccess = { kind: "administrator", actorId: "staff-a", forcePasswordChange: false, permissionKeys: new Set(["evaluations.read", "evaluations.write", "evaluations.confirm", "evaluations.standard.write"]), scopes: [{ kind: "all", id: null }] }
const revision = { expectedVersion: 1, gradeCode: "B", internalComment: "修改后内部观察", excellent: false, attention: true } as const

async function fixture() {
  const row: StudentEvaluationEntity = Object.assign(new StudentEvaluationEntity(), { id: "eval-a", tourSessionId: "session-a", personRef: "paid:line-a", organizationId: "school-a", displayName: "学生甲", standardId: "std-a", standardVersion: 2, gradeCode: "A", gradeLabel: "学校A", confirmedAt: new Date(), confirmedByStaffId: "staff-a" })
  const standard = Object.assign(new EvaluationStandardEntity(), { id: "std-a", tourSessionId: "session-a", confirmedAt: new Date(), version: 2, items: [{ code: "A", label: "学校A", description: "学校A规则" }, { code: "B", label: "学校B", description: "学校B规则" }], dimensions: [{ code: "participation", label: "参与态度", description: "参与事实" }] })
  const people = ["a", "b"].map((suffix) => ({ id: `line-${suffix}`, tourSessionId: "session-a", organizationId: "school-a", displayName: `学生${suffix}`, participantKind: "student", importedRole: null, identityHash: null, orderStatus: "paid", rosterStatus: "active" }))
  const lockedRows = { where() { return this }, setLock() { return this }, getMany: async () => [row] }
  const manager = {
    query: async (sql: string) => sql.includes("from order_lines") ? people : [],
    createQueryBuilder: () => lockedRows,
    findOne: async () => row,
    findOneBy: async (entity: unknown) => entity === TourSessionEntity ? { id: "session-a", organizationId: "school-a" } : standard,
    find: vi.fn(async () => [standard]),
    save: async (value: unknown) => value,
  }
  const assigned = vi.fn(async () => { throw new ForbiddenException("guide not assigned") })
  const module = await Test.createTestingModule({ providers: [EvaluationsService,
    { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => ({ manager, transaction: async (run: (value: typeof manager) => Promise<unknown>) => run(manager) }) } },
    { provide: ExecutionAccessService, useValue: { assertAssigned: assigned } },
  ] }).compile()
  return { service: module.get(EvaluationsService), row, manager, assigned, people }
}

describe("evaluation service workflow", () => {
  it("rejects final confirmation with missing students and leaves existing confirmation unchanged", async () => {
    // Given one recorded grade and a second eligible student without a record.
    const { service, row } = await fixture()
    row.confirmedAt = null
    // When final confirmation is requested, then the missing person is named and nothing is confirmed.
    await expect(service.confirmSession(staff, "session-a")).rejects.toMatchObject({ response: { code: "evaluation_students_ungraded", pendingStudents: [{ personRef: "paid:line-b", displayName: "学生b" }] } })
    expect(row.confirmedAt).toBeNull()
    expect(row.version).toBe(1)
  })
  it.each(["adult", "inactive"])("rejects revision when the target becomes %s", async (state) => {
    // Given a previously evaluated person whose current eligibility changed.
    const { service, people, row } = await fixture()
    const target = people[0]
    if (!target) throw new Error("Missing fixture person")
    if (state === "adult") target.participantKind = "adult"
    else target.rosterStatus = "cancelled"
    // When revised, then the target is rejected without changing the record.
    await expect(service.revise(staff, row.id, revision)).rejects.toBeInstanceOf(ConflictException)
    expect(row.version).toBe(1)
  })
  it("persists revised dimension facts and revokes confirmation without changing the manual grade", async () => {
    const { service } = await fixture()
    const dimensionObservations = [{ code: "participation", observation: "补充：主动整理小组记录" }]
    const result = await service.revise(staff, "eval-a", parseEvaluationRevision({ ...revision, gradeCode: "A", dimensionObservations }))
    expect(result).toMatchObject({ gradeCode: "A", version: 2, confirmedAt: null, dimensionObservations })
  })

  it("rejects unknown dimensions against the selected confirmed standard", async () => {
    const { service, row } = await fixture()
    await expect(service.revise(staff, "eval-a", parseEvaluationRevision({ ...revision, dimensionObservations: [{ code: "unknown", observation: "观察事实" }] }))).rejects.toBeInstanceOf(ConflictException)
    expect(row.version).toBe(1)
  })

  it("preserves dimension observations when an older client omits the optional field", async () => {
    const { service, row } = await fixture()
    const dimensionObservations = [{ code: "participation", observation: "旧客户端未修改的事实" }]
    Object.assign(row, { dimensionObservations })
    const result = await service.revise(staff, "eval-a", revision)
    expect(result).toMatchObject({ dimensionObservations })
  })
  it("returns revision identity and clears confirmation when one grade is revised", async () => {
    const { service } = await fixture()
    const result = await service.revise(staff, "eval-a", revision)
    expect(result).toMatchObject({ id: "eval-a", version: 2, standardId: "std-a", gradeCode: "B", gradeLabel: "学校B", confirmedAt: null, internalComment: "修改后内部观察" })
  })
  it("rejects stale individual changes without changing the existing grade", async () => {
    const { service, row } = await fixture()
    await expect(service.revise(staff, "eval-a", { ...revision, expectedVersion: 2 })).rejects.toBeInstanceOf(ConflictException)
    expect(row.gradeCode).toBe("A")
  })
  it("rejects a grade when the stored observation has no confirmed standard", async () => {
    const { service, row } = await fixture()
    row.standardId = null
    await expect(service.revise(staff, "eval-a", revision)).rejects.toBeInstanceOf(ConflictException)
  })
  it("attaches an explicitly selected confirmed standard when revising an observation without a standard", async () => {
    const { service, row } = await fixture()
    row.standardId = null
    row.gradeCode = null
    const result = await service.revise(staff, row.id, parseEvaluationRevision({ ...revision, standardId: "std-a" }))
    expect(result).toMatchObject({ standardId: "std-a", gradeCode: "B", gradeLabel: "学校B", version: 2, confirmedAt: null })
  })
  it("rejects an unassigned guide before exposing evaluation records", async () => {
    const { service, manager } = await fixture()
    await expect(service.dashboard({ ...staff, kind: "guide" }, "session-a")).rejects.toBeInstanceOf(ForbiddenException)
    expect(manager.find).not.toHaveBeenCalled()
  })
  it("does not treat a colliding class scope ID as school access", async () => {
    const { service } = await fixture()
    await expect(service.standards({ ...staff, scopes: [{ kind: "class", id: "school-a" }] }, "session-a")).rejects.toBeInstanceOf(ForbiddenException)
  })
  it("lets standard writers read rules without granting internal student observations", async () => {
    const { service } = await fixture()
    const writer: StaffAccess = { ...staff, permissionKeys: new Set(["evaluations.standard.write"]) }
    expect(await service.standards(writer, "session-a")).toMatchObject([{ id: "std-a", items: [{ code: "A" }, { code: "B" }] }])
    await expect(service.dashboard(writer, "session-a")).rejects.toBeInstanceOf(ForbiddenException)
  })
})
