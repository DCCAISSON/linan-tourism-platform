import { BadRequestException, NotFoundException } from "@nestjs/common"

export function malformedRosterInput(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}

export function rosterSessionNotFound(): NotFoundException {
  return new NotFoundException({ code: "not_found", message: "tour session was not found" })
}
