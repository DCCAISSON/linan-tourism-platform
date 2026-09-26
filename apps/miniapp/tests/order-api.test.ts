import { describe, expect, it } from "vitest"
import {
  ApiError,
  createMiniappApi,
  type MiniappRequestOptions,
  type RequestTransport,
} from "../src/api"

const orderResponse = {
  id: "order-1",
  code: "ORDER-1",
  enrollmentId: "enrollment-1",
  status: "pending_payment",
  amountFen: 39_600,
  paidFen: 0,
  payerName: "测试家长",
  participantCount: 2,
}

const paymentResponse = {
  id: "payment-1",
  orderId: "order-1",
  paymentNo: "PAYMENT-1",
  provider: "local_mock",
  status: "pending",
  amountFen: 39_600,
}

describe("miniapp order API client", () => {
  it("creates an order without client-controlled amounts and keeps an idempotent response stable", async () => {
    // Given
    const requests: MiniappRequestOptions[] = []
    const request: RequestTransport = async (options) => {
      requests.push(options)
      return { data: orderResponse, statusCode: 201 }
    }
    const api = createMiniappApi({
      baseUrl: "https://api.example.test",
      familyIdentityHeader: "local-family-dev",
      request,
    })
    const payload = {
      enrollmentId: "enrollment-1",
      payerName: "测试家长",
      requestIdempotencyKey: "order-request-1",
      amountFen: 1,
      paidFen: 1,
    }

    // When
    const first = await api.createOrder(payload)
    const repeated = await api.createOrder(payload)

    // Then
    expect(first).toEqual(orderResponse)
    expect(repeated).toEqual(first)
    expect(requests).toHaveLength(2)
    for (const requestOptions of requests) {
      expect(requestOptions).toMatchObject({
        url: "https://api.example.test/orders",
        method: "POST",
        header: {
          "Content-Type": "application/json",
          "x-linan-dev-family-identity": "local-family-dev",
        },
        data: {
          enrollmentId: "enrollment-1",
          payerName: "测试家长",
          requestIdempotencyKey: "order-request-1",
        },
      })
      expect(requestOptions.data).not.toHaveProperty("amountFen")
      expect(requestOptions.data).not.toHaveProperty("paidFen")
    }
  })

  it("reads an authoritative order without sending a body", async () => {
    // Given
    const requests: MiniappRequestOptions[] = []
    const request: RequestTransport = async (options) => {
      requests.push(options)
      return { data: orderResponse, statusCode: 200 }
    }
    const api = createMiniappApi({ baseUrl: "https://api.example.test", request })

    // When
    const order = await api.getOrder("order/with space")

    // Then
    expect(order).toEqual(orderResponse)
    expect(requests).toEqual([
      {
        url: "https://api.example.test/orders/order%2Fwith%20space",
        method: "GET",
        header: {},
      },
    ])
  })

  it("starts a local mock payment with an empty body and parses its response", async () => {
    // Given
    const requests: MiniappRequestOptions[] = []
    const request: RequestTransport = async (options) => {
      requests.push(options)
      return { data: paymentResponse, statusCode: 201 }
    }
    const api = createMiniappApi({ baseUrl: "https://api.example.test", request })

    // When
    const payment = await api.createMockPayment("order-1")

    // Then
    expect(payment).toEqual(paymentResponse)
    expect(requests).toEqual([
      {
        url: "https://api.example.test/payments/mock/order-1",
        method: "POST",
        header: { "Content-Type": "application/json" },
        data: {},
      },
    ])
    expect(requests[0]?.data).not.toHaveProperty("amountFen")
    expect(requests[0]?.data).not.toHaveProperty("paidFen")
  })


  it("starts a WeChat payment with a login code and bearer token", async () => {
    // Given
    const requests: MiniappRequestOptions[] = []
    const wechatPaymentResponse = {
      id: "payment-1", orderId: "order-1", paymentNo: "PAYMENT-1", provider: "wechat_pay", status: "pending", amountFen: 39_600,
      miniappPayment: { timeStamp: "1", nonceStr: "nonce", package: "prepay_id=wx", signType: "RSA", paySign: "sig" },
    }
    const request: RequestTransport = async (options) => {
      requests.push(options)
      return { data: wechatPaymentResponse, statusCode: 201 }
    }
    const api = createMiniappApi({ baseUrl: "https://api.example.test", wechatSessionToken: "server-token", request })

    // When
    const payment = await api.createWechatPayment("order-1", "wx-code")

    // Then
    expect(payment).toEqual(wechatPaymentResponse)
    expect(requests).toEqual([{
      url: "https://api.example.test/wechat/payments/order-1/miniapp",
      method: "POST",
      header: { "Content-Type": "application/json", Authorization: "Bearer server-token" },
      data: { code: "wx-code" },
    }])
  })

  it("rejects malformed order responses", async () => {
    // Given
    const request: RequestTransport = async () => ({
      data: { ...orderResponse, status: "processing" },
      statusCode: 200,
    })
    const api = createMiniappApi({ baseUrl: "https://api.example.test", request })

    // When / Then
    await expect(api.getOrder("order-1")).rejects.toEqual(new ApiError(0, "status 响应格式不正确"))
  })

  it("rejects malformed payment responses", async () => {
    // Given
    const request: RequestTransport = async () => ({
      data: { ...paymentResponse, amountFen: 39_600.5 },
      statusCode: 201,
    })
    const api = createMiniappApi({ baseUrl: "https://api.example.test", request })

    // When / Then
    await expect(api.createMockPayment("order-1")).rejects.toEqual(
      new ApiError(0, "amountFen 响应格式不正确"),
    )
  })

  it("keeps non-2xx order errors readable", async () => {
    // Given
    const request: RequestTransport = async () => ({
      data: { message: "order does not belong to the current family" },
      statusCode: 403,
    })
    const api = createMiniappApi({ baseUrl: "https://api.example.test", request })

    // When / Then
    await expect(api.getOrder("order-1")).rejects.toEqual(
      new ApiError(403, "order does not belong to the current family"),
    )
  })
  it("reads server payment capabilities from the public capabilities endpoint", async () => {
    const requests: MiniappRequestOptions[] = []
    const request = async (options: MiniappRequestOptions) => {
      requests.push(options)
      return {
        statusCode: 200,
        data: { wechatPaymentEnabled: false, wechatRefundEnabled: false, paymentReconciliationEnabled: true },
      }
    }
    const api = createMiniappApi({ baseUrl: "https://api.example.test", request })

    await expect(api.getCapabilities()).resolves.toEqual({
      wechatPaymentEnabled: false,
      wechatRefundEnabled: false,
      paymentReconciliationEnabled: true,
    })
    expect(requests[0]?.url).toBe("https://api.example.test/capabilities")
    expect(requests[0]?.method).toBe("GET")
  })

})
