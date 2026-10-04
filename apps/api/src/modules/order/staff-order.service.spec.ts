import { ORDER_STATUS } from "@linan/contracts"
import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parseStaffOrderFilters } from "./staff-order.service.js"

describe("staff order filters", () => {
  it("parses an empty query as the first page without a status filter", () => {
    expect(parseStaffOrderFilters({})).toEqual({ keyword: "", status: null, page: 1 })
  })

  it("accepts an exact order status and rejects unknown values", () => {
    expect(parseStaffOrderFilters({ keyword: "  张三  ", status: ORDER_STATUS.paid, page: "2" })).toEqual({ keyword: "张三", status: "paid", page: 2 })
    expect(() => parseStaffOrderFilters({ status: "unknown" })).toThrow(BadRequestException)
    expect(() => parseStaffOrderFilters({ page: "0" })).toThrow(BadRequestException)
  })
})
