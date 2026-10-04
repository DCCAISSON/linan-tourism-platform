import "reflect-metadata"
import { Test } from "@nestjs/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RefundApplicationEntity } from "../../domain/entities/refund-application.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { WechatPaymentService } from "../wechat/wechat-payment.service.js"
import { RefundApplicationService } from "./refund-application.service.js"

const access: StaffAccess = {
  actorId: "staff-1", kind: "administrator", forcePasswordChange: false,
  permissionKeys: new Set(["refunds.execute"]), scopes: [{ kind: "all", id: null }],
}

async function setup() {
  vi.stubEnv("NODE_ENV", "production")
  const application: RefundApplicationEntity = Object.assign(new RefundApplicationEntity(), {
    id: "application-1", orderId: "order-1", organizationId: "org-1", status: "approved",
    reason: "行程调整", amountFen: 100, refundRequestId: null,
    lines: [{ lineId: "line-1", displayName: "参加人甲", amountFen: 100 }],
    createdAt: new Date(), updatedAt: new Date(), reviewedAt: null,
  })
  const manager = {
    findOne: vi.fn(async () => application),
    findOneBy: vi.fn(async () => ({ id: "refund-1", status: "pending" })),
    save: vi.fn(async () => application),
  }
  const createWechatRefund = vi.fn(async () => ({ id: "refund-1", status: "pending" }))
  const module = await Test.createTestingModule({ providers: [RefundApplicationService,
    { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => ({ transaction: async (action: (value: typeof manager) => Promise<unknown>) => action(manager) }) } },
    { provide: AuditLogService, useValue: { record: vi.fn() } },
    { provide: WechatPaymentService, useValue: { createWechatRefund } },
  ] }).compile()
  return { service: module.get(RefundApplicationService), application, createWechatRefund }
}

describe("approved application WeChat execution", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("uses approved participant data and remains pending until provider confirmation", async () => {
    const { service, application, createWechatRefund } = await setup()
    const result = await service.execute(access, application.id, { outcome: "succeeded", failureMessage: null })
    expect(createWechatRefund).toHaveBeenCalledWith("order-1", {
      lineIds: ["line-1"], reason: "行程调整", note: null, idempotencyKey: "refund-application:application-1",
    }, "staff-1")
    expect(result).toMatchObject({ refundRequestId: "refund-1", refundStatus: "pending" })
  })

  it("does not send another refund when execution is repeated", async () => {
    const { service, application, createWechatRefund } = await setup()
    application.refundRequestId = "refund-1"
    await service.execute(access, application.id, { outcome: "succeeded", failureMessage: null })
    expect(createWechatRefund).not.toHaveBeenCalled()
  })

  it("rejects applications that have not been approved", async () => {
    const { service, application, createWechatRefund } = await setup()
    application.status = "submitted"
    await expect(service.execute(access, application.id, { outcome: "succeeded", failureMessage: null })).rejects.toMatchObject({ response: { code: "refund_application_not_approved" } })
    expect(createWechatRefund).not.toHaveBeenCalled()
  })

  it("rejects the legacy manual failure button without initiating real money movement", async () => {
    const { service, application, createWechatRefund } = await setup()
    await expect(service.execute(access, application.id, { outcome: "failed", failureMessage: "人工登记" })).rejects.toMatchObject({ response: { code: "manual_refund_result_unavailable" } })
    expect(createWechatRefund).not.toHaveBeenCalled()
  })
})
