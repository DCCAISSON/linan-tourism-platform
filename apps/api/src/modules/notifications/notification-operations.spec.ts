import { afterEach, describe, expect, it, vi } from "vitest"
import { createDomainDataSource } from "../../domain/data-source.js"
import { NotificationContentVersionEntity } from "../../domain/entities/notification-content-version.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { NotificationAccessService } from "./notification-access.service.js"
import { NotificationManagementService } from "./notification-management.service.js"

describe("notification operational content", () => {
  afterEach(() => vi.restoreAllMocks())
  it("returns saved template fields when staff reloads a content version", async () => {
    // Given a persisted version and an authorized reader.
    const source = createDomainDataSource("mysql://localhost/unused")
    const database = new ConfigurationDatabaseService()
    vi.spyOn(database, "getDataSource").mockResolvedValue(source)
    const access = new NotificationAccessService()
    vi.spyOn(access, "staffSession").mockResolvedValue(Object.assign(new TourSessionEntity(), { id: "session" }))
    vi.spyOn(source.manager, "find").mockImplementation(async target => target === NotificationContentVersionEntity
      ? [Object.assign(new NotificationContentVersionEntity(), { title: "集合提醒", bodyText: "准时到达", templateDataJson: '{"thing3":{"value":"学校南门"}}' })] : [])
    vi.spyOn(source.manager, "findBy").mockResolvedValue([])
    // When the session is read.
    const result = await new NotificationManagementService(database, access).session({ kind: "administrator", forcePasswordChange: false, actorId: "staff", permissionKeys: new Set(["notifications.read"]), scopes: [{ kind: "all", id: null }] }, "session")
    // Then the actual values survive the read boundary.
    expect(result.contents[0]).toMatchObject({ templateData: { thing3: { value: "学校南门" } } })
  })
})
