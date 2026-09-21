import { ORDER_STATUS, type OrderStatus } from "@linan/contracts"
import { BadRequestException, Inject, Injectable } from "@nestjs/common"
import { EnrollmentEntity, OrderEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { toHistoryItem, toOrderDetail } from "./family-order.service.js"
import { orderNotFound } from "./order.errors.js"
import type { OrderDetailResponse, StaffOrderListResponse } from "./order.types.js"

export type StaffOrderFilters = { readonly keyword: string; readonly status: OrderStatus | null; readonly page: number }

export function parseStaffOrderFilters(query: unknown): StaffOrderFilters {
  if (!isRecord(query)) throw malformedInput()
  const record = query
  const keyword = record["keyword"] ?? ""
  const status = record["status"] ?? ""
  const page = record["page"] ?? "1"
  if (typeof keyword !== "string" || keyword.length > 64 || typeof status !== "string"
    || (status !== "" && !isOrderStatus(status))
    || typeof page !== "string" || !/^[1-9]\d{0,4}$/.test(page)) throw malformedInput()
  return { keyword: keyword.trim(), status: status === "" ? null : status, page: Number(page) }
}

function isOrderStatus(value: string): value is OrderStatus {
  return Object.values(ORDER_STATUS).some((status) => status === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function malformedInput(): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message: "invalid staff order filters" })
}

@Injectable()
export class StaffOrderService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async list(filters: StaffOrderFilters): Promise<StaffOrderListResponse> {
    const manager = (await this.database.getDataSource()).manager
    const query = manager.getRepository(OrderEntity).createQueryBuilder("o")
    if (filters.keyword !== "") {
      query.andWhere("(o.code LIKE :keyword OR o.payer_name LIKE :keyword)", { keyword: `%${filters.keyword}%` })
    }
    if (filters.status !== null) query.andWhere("o.status = :status", { status: filters.status })
    const pageSize = 20
    const [orders, total] = await query.orderBy("o.created_at", "DESC").addOrderBy("o.id", "DESC")
      .skip((filters.page - 1) * pageSize).take(pageSize).getManyAndCount()
    return {
      orders: await Promise.all(orders.map(async (order) => {
        const enrollment = await manager.findOneBy(EnrollmentEntity, { id: order.enrollmentId, organizationId: order.organizationId })
        if (enrollment === null) throw orderNotFound()
        return toHistoryItem(manager, { order, enrollment })
      })),
      total, page: filters.page, pageSize,
    }
  }

  async detail(orderId: string): Promise<OrderDetailResponse> {
    const manager = (await this.database.getDataSource()).manager
    const order = await manager.findOneBy(OrderEntity, { id: orderId })
    if (order === null) throw orderNotFound()
    const enrollment = await manager.findOneBy(EnrollmentEntity, { id: order.enrollmentId, organizationId: order.organizationId })
    if (enrollment === null) throw orderNotFound()
    return toOrderDetail(manager, { order, enrollment })
  }
}
