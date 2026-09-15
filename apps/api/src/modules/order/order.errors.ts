import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"

export function orderNotFound(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "order was not found" })
}

export function enrollmentNotFound(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "enrollment was not found" })
}

export function paymentNotFound(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "mock payment was not found" })
}

export function mockProviderUnavailable(): NotFoundException {
  return new NotFoundException({
    code: "mock_provider_unavailable",
    message: "mock payment provider is unavailable",
  })
}

export function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: "idempotency_conflict",
    message: "idempotency key was already used for different order input",
  })
}

export function enrollmentOrderConflict(): ConflictException {
  return new ConflictException({
    code: "enrollment_order_exists",
    message: "enrollment already has an order",
  })
}

export function providerMismatch(): BadRequestException {
  return new BadRequestException({ code: "provider_mismatch", message: "payment provider does not match" })
}

export function amountMismatch(): BadRequestException {
  return new BadRequestException({ code: "amount_mismatch", message: "payment amount does not match order" })
}

export function eventConflict(): ConflictException {
  return new ConflictException({
    code: "event_conflict",
    message: "provider event identifier was reused with different values",
  })
}

export function transactionConflict(): ConflictException {
  return new ConflictException({
    code: "transaction_conflict",
    message: "provider transaction does not match this payment",
  })
}

export function orderNotPayable(): ConflictException {
  return new ConflictException({ code: "order_not_payable", message: "order cannot be paid in its current state" })
}

export function invalidOrderAmount(): ConflictException {
  return new ConflictException({ code: "invalid_order_amount", message: "calculated order amount is out of range" })
}

export function isDuplicateEntry(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }
  const driverError = "driverError" in error ? error.driverError : null
  if (typeof driverError !== "object" || driverError === null) {
    return false
  }
  const code = "code" in driverError ? driverError.code : null
  return code === "ER_DUP_ENTRY"
}
