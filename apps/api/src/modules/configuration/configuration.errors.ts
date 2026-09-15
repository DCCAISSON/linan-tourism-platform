import { ConflictException, NotFoundException } from "@nestjs/common"

export function notFound(message: string): NotFoundException {
  return new NotFoundException({
    code: "not_found",
    message,
  })
}

export function throwWriteConflict(error: unknown): never {
  if (error instanceof NotFoundException) {
    throw error
  }

  const code = readDriverCode(error)
  if (code === "ER_DUP_ENTRY") {
    throw new ConflictException({
      code: "duplicate_business_key",
      message: "business key already exists",
    })
  }

  if (code === "ER_ROW_IS_REFERENCED_2") {
    throw new ConflictException({
      code: "referenced_business_record",
      message: "business record is referenced by existing records",
    })
  }

  throw error
}

function readDriverCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null
  }

  const driverError = "driverError" in error ? error.driverError : null
  if (typeof driverError !== "object" || driverError === null) {
    return null
  }

  const code = "code" in driverError ? driverError.code : null
  return typeof code === "string" ? code : null
}
