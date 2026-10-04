import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { FamilyOrderService } from "./family-order.service.js"
import { MockPaymentService } from "./mock-payment.service.js"
import { parseMockPaymentEvent, parseNewOrder, parseOrderId } from "./order.parser.js"
import { OrderService } from "./order.service.js"
import { OrderCancellationService } from "./order-cancellation.service.js"
import type { FamilyOrderDetailResponse, MockPaymentResponse, OrderHistoryItem, OrderResponse } from "./order.types.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller()
export class OrderController {
  constructor(
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
    @Inject(FamilyOrderService) private readonly history: FamilyOrderService,
    @Inject(OrderCancellationService) private readonly cancellations: OrderCancellationService,
  ) {}

  @Post("orders")
  async create(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<OrderResponse> {
    return this.orders.create(await this.identity.resolve(headers), parseNewOrder(body))
  }

  @Get("orders")
  async list(@Headers() headers: RequestHeaders): Promise<readonly OrderHistoryItem[]> {
    return this.history.list(await this.identity.resolve(headers))
  }

  @Get("orders/:id/detail")
  async detail(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<FamilyOrderDetailResponse> {
    return this.history.detail(await this.identity.resolve(headers), parseOrderId(id))
  }

  @Get("orders/:id")
  async get(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<OrderResponse> {
    return this.orders.get(await this.identity.resolve(headers), parseOrderId(id))
  }

  @Post("orders/:id/cancel")
  async cancel(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<OrderResponse> {
    return this.cancellations.cancel(await this.identity.resolve(headers), parseOrderId(id))
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
    return this.payments.process(await this.identity.resolve(headers), parseMockPaymentEvent(body))
  }

  @Post(":orderId")
  async start(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string): Promise<MockPaymentResponse> {
    this.payments.ensureAvailable()
    return this.payments.start(await this.identity.resolve(headers), parseOrderId(orderId))
  }
}
