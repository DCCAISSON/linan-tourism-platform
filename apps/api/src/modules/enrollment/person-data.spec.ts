import { afterEach, describe, expect, it } from "vitest"
import { decryptPersonValue, protectPersonData } from "./person-data.js"

describe("person data protection", () => {
  const previousKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
      return
    }
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousKey
  })

  it("rejects ciphertext when the configured key is different from the encryption key", () => {
    // Given
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 21).toString("base64")
    const protectedData = protectPersonData({
      identityNumber: virtualResidentId("20100101", "015"),
      phone: virtualPhone("2015"),
    })

    // When
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 22).toString("base64")

    // Then
    expect(() => decryptPersonValue(protectedData.identityCiphertext, protectedData.keyVersion)).toThrow(
      "encrypted person data cannot be decrypted",
    )
  })
})

function virtualPhone(sequence: string): string {
  return `1990000${sequence.padStart(4, "0")}`
}

function virtualResidentId(birthDate: string, sequence: string): string {
  const body = `999999${birthDate}${sequence}`
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const
  const checkCodes = "10X98765432"
  let sum = 0
  for (const [index, weight] of weights.entries()) {
    sum += Number(body[index] ?? "0") * weight
  }
  return `${body}${checkCodes[sum % 11] ?? "0"}`
}
