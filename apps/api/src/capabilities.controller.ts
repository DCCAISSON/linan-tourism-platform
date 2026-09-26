import { Controller, Get } from "@nestjs/common"
import { readPaymentCapabilities, type PaymentCapabilities } from "./modules/wechat/wechat-config.js"

@Controller()
export class CapabilitiesController {
  @Get("capabilities")
  getCapabilities(): PaymentCapabilities {
    return readPaymentCapabilities()
  }
}
