import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export function assertStaffPasswordPolicy(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new StaffPasswordPolicyError("password must be 12-128 characters")
  }
  if (!/[A-Za-z]/u.test(password) || !/[0-9]/u.test(password)) {
    throw new StaffPasswordPolicyError("password must contain letters and digits")
  }
}

export async function hashStaffPassword(password: string): Promise<string> {
  assertStaffPasswordPolicy(password)
  const salt = randomBytes(SALT_LENGTH).toString("hex")
  const derived = await scryptAsync(password, salt, KEY_LENGTH)
  if (!(derived instanceof Buffer)) {
    throw new StaffPasswordHashError()
  }
  return `scrypt$${salt}$${derived.toString("hex")}`
}

export async function verifyStaffPassword(password: string, passwordHash: string): Promise<boolean> {
  const [scheme, salt, hash] = passwordHash.split("$")
  if (scheme !== "scrypt" || salt === undefined || hash === undefined) {
    return false
  }
  const expected = Buffer.from(hash, "hex")
  if (expected.length !== KEY_LENGTH) {
    return false
  }
  const actual = await scryptAsync(password, salt, KEY_LENGTH)
  if (!(actual instanceof Buffer)) {
    throw new StaffPasswordHashError()
  }
  return timingSafeEqual(actual, expected)
}

export class StaffPasswordPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StaffPasswordPolicyError"
  }
}

class StaffPasswordHashError extends Error {
  constructor() {
    super("staff password hash failed")
    this.name = "StaffPasswordHashError"
  }
}
