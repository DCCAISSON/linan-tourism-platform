import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { MockPaymentService } from "./mock-payment.service.js"
import { FamilyOrderService } from "./family-order.service.js"
import { LocalRefundController } from "./local-refund.controller.js"
import { LocalRefundService } from "./local-refund.service.js"
import { MockPaymentController, OrderController } from "./order.controller.js"
import { OrderService } from "./order.service.js"

@Module({
  controllers: [OrderController, MockPaymentController, LocalRefundController],
  providers: [ConfigurationDatabaseService, EnrollmentIdentityService, OrderService, MockPaymentService, FamilyOrderService, LocalRefundService],
})
export class OrderModule {}
