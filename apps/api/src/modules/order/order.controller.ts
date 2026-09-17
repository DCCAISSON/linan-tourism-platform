import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { FamilyOrderService } from "./family-order.service.js"
import { MockPaymentService } from "./mock-payment.service.js"
import { parseMockPaymentEvent, parseNewOrder, parseOrderId } from "./order.parser.js"
import { OrderService } from "./order.service.js"
import type { MockPaymentResponse, OrderDetailResponse, OrderHistoryItem, OrderResponse } from "./order.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller()
export class OrderController {
  constructor(
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
    @Inject(FamilyOrderService) private readonly history: FamilyOrderService,
  ) {}

  @Post("orders")
  async create(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<OrderResponse> {
    return this.orders.create(this.identity.resolve(headers), parseNewOrder(body))
  }

  @Get("orders")
  async list(@Headers() headers: RequestHeaders): Promise<readonly OrderHistoryItem[]> {
    return this.history.list(this.identity.resolve(headers))
  }

  @Get("orders/:id/detail")
  async detail(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<OrderDetailResponse> {
    return this.history.detail(this.identity.resolve(headers), parseOrderId(id))
  }

  @Get("orders/:id")
  async get(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<OrderResponse> {
    return this.orders.get(this.identity.resolve(headers), parseOrderId(id))
  }
}

@Controller("payments/mock")
export class MockPaymentController {
  constructor(
    @Inject(MockPaymentService) private readonly payments: MockPaymentService,
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
  ) {}

  @Post("events")
  async event(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<MockPaymentResponse> {
    this.payments.ensureAvailable()
    return this.payments.process(this.identity.resolve(headers), parseMockPaymentEvent(body))
  }

  @Post(":orderId")
  async start(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string): Promise<MockPaymentResponse> {
    this.payments.ensureAvailable()
    return this.payments.start(this.identity.resolve(headers), parseOrderId(orderId))
  }
}
