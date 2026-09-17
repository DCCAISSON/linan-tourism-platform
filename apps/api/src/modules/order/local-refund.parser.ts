import { BadRequestException } from "@nestjs/common"

export type LocalRefundSelection = { readonly lineIds: readonly string[] }
export type LocalRefundSimulation = LocalRefundSelection & { readonly outcome: "succeeded" | "failed" }

export function parseRefundSelection(body: unknown): LocalRefundSelection {
  return parseSelection(body, ["lineIds"])
}

export function parseRefundSimulation(body: unknown): LocalRefundSimulation {
  const selection = parseSelection(body, ["lineIds", "outcome"])
  if (typeof body !== "object" || body === null || !("outcome" in body)
    || (body.outcome !== "succeeded" && body.outcome !== "failed")) {
    throw malformedInput()
  }
  return { ...selection, outcome: body.outcome }
}

function parseSelection(body: unknown, fields: readonly string[]): LocalRefundSelection {
  if (typeof body !== "object" || body === null || Array.isArray(body)
    || Object.keys(body).some((field) => !fields.includes(field)) || !("lineIds" in body)
    || !Array.isArray(body.lineIds) || body.lineIds.length === 0 || body.lineIds.length > 1000) {
    throw malformedInput()
  }
  const lineIds = body.lineIds.map((value: unknown) => {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 64) throw malformedInput()
    return value.trim()
  })
  if (new Set(lineIds).size !== lineIds.length) throw malformedInput()
  return { lineIds }
}

function malformedInput(): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message: "use stored lineIds and an explicit simulation outcome only" })
}
