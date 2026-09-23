import { describe, expect, it } from "vitest"
import { createBusinessApi, type BusinessRequestOptions } from "../src/business-api"

const product = {
  id: "business-1",
  organizationId: "org-1",
  category: "wellness",
  title: "单位疗休养",
  offering: "两日套餐",
  content: "提供基础介绍和咨询回访。",
  referencePriceFen: 98000,
  customerServicePhone: "13968023156",
  bookingUrl: "",
  bookingAuthorized: false,
  media: [],
  mediaAuthorized: true,
  status: "published",
  version: 1,
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
} as const

describe("miniapp business API client", () => {
  it("loads published business products by category", async () => {
    const requests: BusinessRequestOptions[] = []
    const api = createBusinessApi({
      baseUrl: "https://api.example.test/",
      request: async (options) => {
        requests.push(options)
        return { statusCode: 200, data: [product] }
      },
    })

    await expect(api.listProducts("wellness")).resolves.toEqual([product])
    expect(requests[0]?.url).toBe("https://api.example.test/business/products?category=wellness")
  })

  it("posts consultation and returns a receipt without payment or booking state", async () => {
    const requests: BusinessRequestOptions[] = []
    const receipt = { id: "inquiry-1", status: "received" } as const
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      request: async (options) => {
        requests.push(options)
        return { statusCode: 201, data: receipt }
      },
    })

    await expect(api.submitInquiry("business/1", {
      idempotencyKey: "request-1",
      customerType: "individual",
      organizationName: "",
      contactName: "章先生",
      phone: "13968023156",
      request: "想了解民宿套餐。",
    })).resolves.toEqual(receipt)
    expect(requests[0]).toMatchObject({
      url: "https://api.example.test/business/products/business%2F1/inquiries",
      method: "POST",
      header: { "Content-Type": "application/json" },
    })
    expect(JSON.stringify(receipt)).not.toMatch(/paid|booked|room|inventory/i)
  })

  it("rejects private or malformed media URLs from the response", async () => {
    const api = createBusinessApi({
      request: async () => ({ statusCode: 200, data: [{ ...product, media: [{ kind: "image", url: "cos://private/key.jpg" }] }] }),
    })

    await expect(api.listProducts("wellness")).rejects.toThrow("业务内容响应格式不正确")
  })
})
