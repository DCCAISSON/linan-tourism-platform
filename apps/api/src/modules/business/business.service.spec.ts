import { describe, expect, it, vi } from "vitest"
import type { EntityManager } from "typeorm"
import { BusinessInquiryEntity } from "../../domain/entities/business-inquiry.entity.js"
import { BusinessProductEntity } from "../../domain/entities/business-product.entity.js"
import { BusinessService } from "./business.service.js"
import type { InquiryInput } from "./business.types.js"

const inquiry: InquiryInput = {
  idempotencyKey: "inquiry-replay-key",
  customerType: "individual",
  organizationName: "",
  contactName: "Visitor",
  phone: "13800000000",
  request: "Need a one-day trip",
}

describe("BusinessService inquiries", () => {
  it("persists the initial inquiry status explicitly for MySQL inserts", async () => {
    // Given a published product and no prior idempotency record.
    let savedInquiry: Partial<BusinessInquiryEntity> | null = null
    const manager = {
      findOne: vi.fn(() => Promise.resolve(Object.assign(new BusinessProductEntity(), { id: "product-1", organizationId: "org-1", status: "published" }))),
      findOneBy: vi.fn(() => Promise.resolve(null)),
      save: vi.fn((_: typeof BusinessInquiryEntity, value: Partial<BusinessInquiryEntity>) => {
        savedInquiry = value
        return Promise.resolve(Object.assign(new BusinessInquiryEntity(), value))
      }),
    } as unknown as EntityManager
    const database = { getDataSource: vi.fn(() => Promise.resolve({ transaction: (work: (transactionManager: EntityManager) => Promise<unknown>) => work(manager) })) }
    const service = new BusinessService(database as never, { record: vi.fn() } as never)

    // When a public inquiry is submitted.
    const result = await service.submitInquiry("product-1", inquiry)

    // Then the plain insert payload includes the NOT NULL status column.
    expect(result).toMatchObject({ status: "received" })
    expect(savedInquiry).toMatchObject({ productId: "product-1", organizationId: "org-1", status: "inquiry" })
  })
})
