export class RosterApiError extends Error {
  public readonly name = "RosterApiError"
  public readonly status: number

  public constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function readableRosterError(error: unknown): string {
  if (error instanceof RosterApiError) {
    return error.message
  }

  if (error instanceof TypeError) {
    return "无法连接服务器"
  }

  throw error
}
