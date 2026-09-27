import { ForbiddenException } from "@nestjs/common"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDomainDataSource } from "../../domain/data-source.js"
import { EnrollmentEntity } from "../../domain/entities/enrollment.entity.js"
import { OrderEntity } from "../../domain/entities/order.entity.js"
import { NotificationContentVersionEntity } from "../../domain/entities/notification-content-version.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { NotificationAccessService } from "./notification-access.service.js"
import { RecipientAuthorizationService } from "./recipient-authorization.service.js"
import { parseContentVersion, parseRecipientAuthorization } from "./notifications.parser.js"

describe("notification readiness boundaries", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
  const input = { receiverName: "家长", relation: "guardian", channel: "wechat_subscribe", idempotencyKey: "key" }

  it("accepts a login code without accepting a claimed openid", () => {
    expect(parseRecipientAuthorization({ ...input, code: "fresh-code" })).toMatchObject({ code: "fresh-code" })
    expect(() => parseRecipientAuthorization({ ...input, code: "fresh-code", openid: "forged" })).toThrow()
  })

  it.each(["<script>", "has space", "x".repeat(129)])("rejects an invalid configured template %s", (templateId) => {
    expect(() => parseContentVersion({ title: "提醒", bodyText: "集合", templateId, miniappPage: null, templateData: {} })).toThrow()
  })

  it("returns scoped distinct templates only when subscription sending is configured", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_ACCESS_TOKEN", "fixture-token")
    const source = createDomainDataSource("mysql://localhost/unused")
    const database = new ConfigurationDatabaseService()
    vi.spyOn(database, "getDataSource").mockResolvedValue(source)
    const access = new NotificationAccessService()
    vi.spyOn(access, "familyOrder").mockResolvedValue({ order: new OrderEntity(), enrollment: Object.assign(new EnrollmentEntity(), { tourSessionId: "own-session" }) })
    vi.spyOn(source.manager, "find").mockImplementation(async (target, options) => {
      if (target === NotificationContentVersionEntity) {
        expect(options).toMatchObject({ where: { tourSessionId: "own-session" } })
        return ["template-1", "template-1", null, "bad template"].map((templateId) => Object.assign(new NotificationContentVersionEntity(), { id: "version", title: "集合提醒", templateId }))
      }
      return []
    })
    vi.spyOn(source.manager, "findBy").mockResolvedValue([])
    const service = new RecipientAuthorizationService(database, access)
    expect(await service.overview({ familyCode: "own", actorId: "own" }, "order")).toMatchObject({ subscribeTemplates: [{ templateId: "template-1", title: "集合提醒" }] })
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    expect(await service.overview({ familyCode: "own", actorId: "own" }, "order")).toMatchObject({ subscribeTemplates: [] })
  })

  it("does not expose templates when the family cannot access the order", async () => {
    const source = createDomainDataSource("mysql://localhost/unused")
    const database = new ConfigurationDatabaseService()
    vi.spyOn(database, "getDataSource").mockResolvedValue(source)
    const access = new NotificationAccessService()
    vi.spyOn(access, "familyOrder").mockRejectedValue(new ForbiddenException())
    const read = vi.spyOn(source.manager, "find")
    await expect(new RecipientAuthorizationService(database, access).overview({ familyCode: "other", actorId: "other" }, "order")).rejects.toThrow(ForbiddenException)
    expect(read).not.toHaveBeenCalled()
  })
})
