import { DataSource } from "typeorm"
import { describe, expect, it, vi } from "vitest"
import { lockTransportPlan } from "./transport-plan-store.js"

describe("transport writer serialization", () => {
  it("locks the existing session row before the optional plan row even for a cold session", async () => {
    const manager = new DataSource({ type: "mysql" }).manager
    const query = vi.spyOn(manager, "query").mockImplementation(async (sql: string) => sql.includes("from tour_sessions") ? [{ id: "session" }] : [])

    await lockTransportPlan(manager, "session")

    expect(query.mock.calls.map(call => call[0])).toEqual([
      "select id from tour_sessions where id = ? for update",
      "select version from transport_plans where tour_session_id = ? for update",
    ])
  })

  it("returns the existing session-not-found response without creating a plan for an invalid session", async () => {
    const manager = new DataSource({ type: "mysql" }).manager
    const query = vi.spyOn(manager, "query").mockResolvedValue([])

    await expect(lockTransportPlan(manager, "missing")).rejects.toMatchObject({ response: { code: "not_found" }, status: 404 })

    expect(query).toHaveBeenCalledOnce()
  })
})
