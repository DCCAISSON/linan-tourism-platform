import { BadRequestException } from "@nestjs/common"
import type { ContractSignature, NewContractTemplate, SignContractInput } from "./contracts.types.js"

export function contractInputInvalid(): BadRequestException {
  return new BadRequestException({ code: "contract_input_invalid", message: "请完整填写合同信息，并在签名区域手写签名" })
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw contractInputInvalid()
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw contractInputInvalid()
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw contractInputInvalid()
  return value.trim()
}

export function parseTemplateInput(value: unknown): NewContractTemplate {
  const input = record(value)
  onlyKeys(input, ["sourceId", "version", "title", "bodyText", "reviewed"])
  if (input["reviewed"] !== true) throw contractInputInvalid()
  return { sourceId: text(input["sourceId"], 64), version: text(input["version"], 64), title: text(input["title"], 200), bodyText: text(input["bodyText"], 150_000), reviewed: true }
}

export function parseActiveTemplate(value: unknown): string | null {
  const input = record(value)
  onlyKeys(input, ["templateId"])
  return input["templateId"] === null ? null : text(input["templateId"], 64)
}

export function parseSignContract(value: unknown): SignContractInput {
  const input = record(value)
  onlyKeys(input, ["snapshotHash", "signerName", "agreed", "signature"])
  const snapshotHash = text(input["snapshotHash"], 64)
  if (!/^[a-f0-9]{64}$/.test(snapshotHash) || input["agreed"] !== true) throw contractInputInvalid()
  return { snapshotHash, signerName: text(input["signerName"], 120), agreed: true, signature: parseContractSignature(input["signature"]) }
}

export function parseContractSignature(value: unknown): ContractSignature {
  const input = record(value)
  onlyKeys(input, ["width", "height", "strokes"])
  const width = input["width"]
  const height = input["height"]
  const strokes = input["strokes"]
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 100 || width > 2000 || height < 100 || height > 2000
    || !Array.isArray(strokes) || strokes.length < 1 || strokes.length > 100) throw contractInputInvalid()
  let pointCount = 0
  let inkLength = 0
  const parsed = strokes.map((stroke: unknown) => {
    if (!Array.isArray(stroke) || stroke.length === 0 || stroke.length > 5000) throw contractInputInvalid()
    pointCount += stroke.length
    if (pointCount > 5000) throw contractInputInvalid()
    let previous: { readonly x: number; readonly y: number } | undefined
    return stroke.map((point: unknown) => {
      const coordinates = record(point)
      onlyKeys(coordinates, ["x", "y"])
      const x = coordinates["x"]
      const y = coordinates["y"]
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)
        || x < 0 || x > width || y < 0 || y > height) throw contractInputInvalid()
      if (previous !== undefined) inkLength += Math.hypot(x - previous.x, y - previous.y)
      previous = { x, y }
      return previous
    })
  })
  const signature = { width, height, strokes: parsed }
  if (pointCount < 10 || inkLength < Math.min(width, height) * 0.2 || Buffer.byteLength(JSON.stringify(signature)) > 131_072) throw contractInputInvalid()
  return signature
}
