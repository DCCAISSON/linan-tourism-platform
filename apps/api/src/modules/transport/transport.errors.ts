import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common"

export function malformedTransportInput(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}

export function transportSessionNotFound(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "tour session was not found" })
}

export function transportForbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: "staff_scope_forbidden", message })
}
