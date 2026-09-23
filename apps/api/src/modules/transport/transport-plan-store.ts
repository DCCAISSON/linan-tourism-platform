import { ConflictException } from "@nestjs/common"
import type { EntityManager } from "typeorm"

type VersionRow = { readonly version: number | string }

export async function ensureTransportPlan(manager: EntityManager, tourSessionId: string): Promise<number> {
  const rows: readonly VersionRow[] = await manager.query("select version from transport_plans where tour_session_id = ?", [tourSessionId])
  if (rows.length > 0) return Number(rows[0]?.version ?? 1)
  await manager.query("insert into transport_plans (tour_session_id, version) values (?, 1)", [tourSessionId])
  return 1
}

export async function bumpTransportPlanVersion(manager: EntityManager, tourSessionId: string): Promise<number> {
  await ensureTransportPlan(manager, tourSessionId)
  await manager.query("update transport_plans set version = version + 1 where tour_session_id = ?", [tourSessionId])
  return ensureTransportPlan(manager, tourSessionId)
}

export async function requireExpectedPlanVersion(
  manager: EntityManager,
  tourSessionId: string,
  expectedPlanVersion: number,
): Promise<void> {
  const current = await ensureTransportPlan(manager, tourSessionId)
  if (current !== expectedPlanVersion) {
    throw new ConflictException({ code: "stale_plan", message: `车辆计划版本已更新，请刷新后重试。当前版本：${current}` })
  }
}
