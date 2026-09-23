import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { BadRequestException } from "@nestjs/common"

export const PERSON_DATA_KEY_VERSION = "v1" as const
export const PARTICIPANT_KINDS = ["student", "adult"] as const
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number]

export type PlainPersonData = {
  readonly identityNumber: string
  readonly phone: string
}

export type ProtectedPersonData = {
  readonly identityCiphertext: string
  readonly identityHash: string
  readonly identityMasked: string
  readonly phoneCiphertext: string
  readonly phoneHash: string
  readonly phoneMasked: string
  readonly keyVersion: typeof PERSON_DATA_KEY_VERSION
}

const IDENTITY_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const
const IDENTITY_CHECK_CODES = "10X98765432"

export function protectPersonData(input: PlainPersonData): ProtectedPersonData {
  const identityNumber = normalizeIdentityNumber(input.identityNumber)
  const phone = normalizePhone(input.phone)
  return {
    identityCiphertext: encryptValue(identityNumber),
    identityHash: hashCredential(identityNumber),
    identityMasked: maskIdentityNumber(identityNumber),
    phoneCiphertext: encryptValue(phone),
    phoneHash: hashCredential(phone),
    phoneMasked: maskPhone(phone),
    keyVersion: PERSON_DATA_KEY_VERSION,
  }
}

export function decryptPersonValue(ciphertext: string, keyVersion: string): string {
  if (keyVersion !== PERSON_DATA_KEY_VERSION) {
    throw malformedPersonData("unsupported person data key version")
  }
  const key = readPersonDataKey()
  const parts = ciphertext.split(".")
  const [ivBase64, tagBase64, encryptedBase64] = parts
  if (parts.length !== 3 || ivBase64 === undefined || tagBase64 === undefined || encryptedBase64 === undefined) {
    throw malformedPersonData("encrypted person data is malformed")
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"))
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"))
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch (error) {
    if (error instanceof Error) {
      throw malformedPersonData("encrypted person data cannot be decrypted")
    }
    throw error
  }
}

export function normalizeParticipantKind(value: string | undefined): ParticipantKind {
  if (value === undefined) {
    return "student"
  }
  if (value === "student" || value === "adult") {
    return value
  }
  throw malformedPersonData("participantKind must be student or adult")
}

export function protectPhoneData(value: string): Pick<ProtectedPersonData, "phoneCiphertext" | "phoneHash" | "phoneMasked" | "keyVersion"> {
  const phone = normalizePhone(value)
  return { phoneCiphertext: encryptValue(phone), phoneHash: hashCredential(phone), phoneMasked: maskPhone(phone), keyVersion: PERSON_DATA_KEY_VERSION }
}

export function encryptValue(value: string): string {
  const key = readPersonDataKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`
}

function hashCredential(value: string): string {
  return createHmac("sha256", readPersonDataKey()).update(value).digest("hex")
}

function readPersonDataKey(): Buffer {
  const raw = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
  if (raw === undefined || raw.trim().length === 0) {
    throw malformedPersonData("PERSON_DATA_ENCRYPTION_KEY_BASE64 is required")
  }
  const decoded = Buffer.from(raw, "base64")
  if (decoded.length !== 32 || decoded.toString("base64") !== raw.trim()) {
    throw malformedPersonData("PERSON_DATA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes")
  }
  return decoded
}

function normalizeIdentityNumber(value: string): string {
  const identity = value.trim().toUpperCase()
  if (!/^\d{17}[\dX]$/.test(identity)) {
    throw malformedPersonData("identityNumber must be a valid resident identity number")
  }
  const dateText = identity.slice(6, 14)
  const year = Number(dateText.slice(0, 4))
  const month = Number(dateText.slice(4, 6))
  const day = Number(dateText.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw malformedPersonData("identityNumber birth date is invalid")
  }
  let sum = 0
  for (const [index, weight] of IDENTITY_WEIGHTS.entries()) {
    sum += Number(identity[index]) * weight
  }
  if (identity[17] !== IDENTITY_CHECK_CODES[sum % 11]) {
    throw malformedPersonData("identityNumber checksum is invalid")
  }
  return identity
}

function normalizePhone(value: string): string {
  const phone = value.trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw malformedPersonData("phone must be a valid mainland China mobile number")
  }
  return phone
}

function maskIdentityNumber(value: string): string {
  return `${value.slice(0, 6)}********${value.slice(14)}`
}

function maskPhone(value: string): string {
  return `${value.slice(0, 3)}****${value.slice(7)}`
}

function malformedPersonData(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}
