import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { MockPaymentService } from "./mock-payment.service.js"
import { FamilyOrderService } from "./family-order.service.js"
import { LocalRefundController } from "./local-refund.controller.js"
import { LocalRefundService } from "./local-refund.service.js"
import { MockPaymentController, OrderController } from "./order.controller.js"
import { OrderService } from "./order.service.js"
import { StaffOrderController } from "./staff-order.controller.js"
import { StaffOrderService } from "./staff-order.service.js"
import { StaffRefundService } from "./staff-refund.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { NotificationsModule } from "../notifications/notifications.module.js"
import { WechatPayClient } from "../wechat/wechat-pay.client.js"
import { OrderCancellationService } from "./order-cancellation.service.js"

@Module({
  imports: [NotificationsModule],
  controllers: [OrderController, MockPaymentController, LocalRefundController, StaffOrderController],
  providers: [ConfigurationDatabaseService, EnrollmentIdentityService, AuditLogService, OrderService, MockPaymentService, FamilyOrderService, LocalRefundService, StaffOrderService, StaffRefundService, WechatPayClient, OrderCancellationService],
})
export class OrderModule {}
