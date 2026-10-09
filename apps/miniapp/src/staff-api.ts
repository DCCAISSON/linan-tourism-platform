import { ApiError } from "./api-error"
import { readCollection, readRecord, readString } from "./api-parsers"
import { FALLBACK_API_BASE_URL, type MiniappRequestOptions, type MiniappRequestResult, type RequestTransport } from "./api-types"
import { clearStaffSession, getStaffSessionToken, type StaffSession } from "./staff-session"

export type StaffRequestOptions = { readonly baseUrl?: string; readonly request?: RequestTransport }
export type StaffAccess = { readonly actorId: string; readonly forcePasswordChange: boolean; readonly permissionKeys: readonly string[] }

export function createStaffRequest(options: StaffRequestOptions = {}) {
  return async (path: string, method: "GET" | "POST" | "DELETE" = "GET", data?: object): Promise<unknown> => {
    const token = getStaffSessionToken()
    if (token === undefined) throw new ApiError(401, "请登录导游账号。")
    try {
      const result = await requestJson(options, { path, method, data, token })
      if (getStaffSessionToken() !== token) throw new ApiError(409, "账号已切换，请重新进入工作台。")
      return result
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) clearStaffSession(token)
      throw error
    }
  }
}

export function createStaffApi(options: StaffRequestOptions = {}) {
  const request = createStaffRequest(options)
  return {
    login: async (username: string, password: string): Promise<StaffSession> => {
      const result = readRecord(await requestJson(options, { path: "/staff/mobile/auth/login", method: "POST", data: { username, password } }))
      const account = readRecord(result["account"])
      const expiresAt = readString(result, "expiresAt")
      const token = readString(result, "token")
      if (!token || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw invalidResponse()
      return { token, expiresAt, account: { id: readString(account, "id"), username: readString(account, "username"), displayName: readString(account, "displayName"), forcePasswordChange: readBoolean(account, "forcePasswordChange") } }
    },
    me: async (): Promise<StaffAccess> => {
      const result = readRecord(await request("/staff/auth/me"))
      return { actorId: readString(result, "actorId"), forcePasswordChange: readBoolean(result, "forcePasswordChange"), permissionKeys: readCollection(result["permissionKeys"], item => {
        if (typeof item !== "string") throw invalidResponse()
        return item
      }) }
    },
    logout: async (): Promise<void> => {
      const token = getStaffSessionToken()
      clearStaffSession(token)
      if (token !== undefined) await requestJson(options, { path: "/staff/mobile/auth/logout", method: "POST", token })
    },
    changePassword: async (username: string, currentPassword: string, newPassword: string): Promise<void> => {
      const token = getStaffSessionToken()
      await requestJson(options, { path: "/staff/mobile/auth/change-password", method: "POST", data: { username, currentPassword, newPassword } })
      if (token !== undefined) clearStaffSession(token)
    },
  }
}

type StaffRequest = { readonly path: string; readonly method: "GET" | "POST" | "DELETE"; readonly data?: object | undefined; readonly token?: string | undefined }

async function requestJson(options: StaffRequestOptions, input: StaffRequest): Promise<unknown> {
  const baseUrl = (options.baseUrl ?? import.meta.env["VITE_API_BASE_URL"] ?? FALLBACK_API_BASE_URL).replace(/\/$/, "")
  const header: Record<string, string> = {}
  if (input.data !== undefined) header["Content-Type"] = "application/json"
  if (input.token !== undefined) header["Authorization"] = `Staff ${input.token}`
  const common = { url: `${baseUrl}${input.path}`, method: input.method, header }
  const result = await (options.request ?? requestWithUni)(input.data === undefined ? common : { ...common, data: input.data })
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new ApiError(result.statusCode, staffError(result.statusCode, result.data))
  }
  return result.data
}

function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return new Promise((resolve, reject) => uni.request({
    url: options.url, method: options.method, header: options.header,
    ...(options.data === undefined ? {} : { data: JSON.stringify(options.data) }),
    timeout: 15000, success: resolve, fail: () => reject(new ApiError(0, "连接失败，请检查网络后重试。")),
  }))
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value !== "boolean") throw invalidResponse()
  return value
}
function invalidResponse(): ApiError { return new ApiError(0, "登录信息暂时无法读取，请重试。") }
function staffError(status: number, value: unknown): string {
  if (status === 401) return "账号、密码不正确或登录已失效，请重新登录。"
  if (status === 403) return "当前账号没有此项权限，请联系工作人员核对分配。"
  if (status === 423 || status === 429) return "尝试次数较多，账号暂时锁定，请稍后再登录。"
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string" && /[\u4e00-\u9fff]/.test(value.message)) return value.message
  return status === 409 ? "记录或安排已变化，请刷新后核对。" : "操作未完成，请检查填写内容后重试。"
}
