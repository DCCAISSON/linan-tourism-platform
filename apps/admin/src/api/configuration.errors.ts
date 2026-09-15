export class ApiError extends Error {
  public readonly status: number

  public constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export function readableApiError(error: unknown): string {
  if (error instanceof ApiError || error instanceof TypeError) {
    return error instanceof ApiError ? error.message : "无法连接服务器"
  }

  throw error
}
