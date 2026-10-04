import type { ContractSignature } from "./contract-types"

export function hasContractSignature(signature: ContractSignature | null): boolean {
  if (signature === null) return false
  let count = 0
  let length = 0
  for (const stroke of signature.strokes) {
    count += stroke.length
    for (let i = 1; i < stroke.length; i++) {
      const point = stroke[i]
      const previous = stroke[i - 1]
      if (point && previous) length += Math.hypot(point.x - previous.x, point.y - previous.y)
    }
  }
  return count >= 10 && count <= 5000 && length >= Math.min(signature.width, signature.height) * 0.2
}
