import { Test } from "@nestjs/testing"
import { describe, expect, it } from "vitest"
import { TourSessionEntity, TransportPlanEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { TransportService } from "./transport.service.js"

describe("transport save response permissions", () => {
  it("redacts preserved document contacts when a writer omits documentSnapshot and lacks sensitive access", async () => {
    // Given
    const session = Object.assign(new TourSessionEntity(), { id: "session", organizationId: "school" })
    const stored = Object.assign(new TransportPlanEntity(), {
      tourSessionId: session.id,
      documentSnapshotJson: { tripTitle: "研学", tripDate: "", schoolName: "", gradeName: "", guideLeaderName: "组长", guideLeaderPhone: "19900000001", schoolLeaderName: "领队", schoolLeaderPhone: "19900000002", parkingInstructions: "", gatheringTime: "07:30", departureTime: "08:00", feeExplanation: "", materialChecklist: "" },
    })
    const manager = {
      findOneBy: async (entity: unknown) => entity === TourSessionEntity ? session : stored,
      query: async (sql: string) => sql.startsWith("select version") ? [{ version: 2 }] : [],
    }
    const module = await Test.createTestingModule({ providers: [TransportService,
      { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => ({ transaction: async (action: (store: typeof manager) => Promise<unknown>) => action(manager) }) } },
      { provide: DevStaffAccessService, useValue: { assertTransportWriteScope: () => undefined } },
      { provide: AuditLogService, useValue: { record: async () => undefined } },
    ] }).compile()
    const access: StaffAccess = { kind: "school", actorId: "writer", forcePasswordChange: false, permissionKeys: new Set(["transport.write"]), scopes: [{ kind: "school", id: "school" }] }
    try {
      // When
      const saved = await module.get(TransportService).savePlan(access, session.id, { vehicles: [] })
      // Then
      expect(saved.documentSnapshot).toMatchObject({ guideLeaderName: "", guideLeaderPhone: "", schoolLeaderName: "", schoolLeaderPhone: "", departureTime: "08:00" })
      expect(stored.documentSnapshotJson).toMatchObject({ guideLeaderName: "组长", guideLeaderPhone: "19900000001", schoolLeaderName: "领队", schoolLeaderPhone: "19900000002" })
    } finally {
      await module.close()
    }
  })
})
