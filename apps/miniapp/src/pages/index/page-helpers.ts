import { ApiError } from "../../api"
import type { LoadState, PageMode } from "../../enrollment-flow"
import type { PickerChangeEvent } from "./useEnrollmentPage"

export type StateTone = "success" | "warning" | "error" | "info"

export function stateLabel(loadState: LoadState, pageMode: PageMode): string {
  if (loadState !== "ready") {
    switch (loadState) {
      case "loading":
        return "正在加载"
      case "empty":
        return "暂无可选团期"
      case "error":
        return "加载失败"
      default:
        return assertNever(loadState)
    }
  }

  switch (pageMode) {
    case "editing":
      return "可填写"
    case "review":
      return "待核对"
    case "submitting":
      return "提交中"
    case "paymentPending":
      return "待支付"
    case "paid":
      return "已支付"
    default:
      return assertNever(pageMode)
  }
}

export function readPickerIndex(event: PickerChangeEvent): number {
  const value = event.detail.value
  return typeof value === "number" ? value : Number.parseInt(value, 10)
}

export function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message.length > 0) return error.message
  return fallback
}

export function readStateTone(loadState: LoadState, pageMode: PageMode): StateTone {
  switch (loadState) {
    case "loading":
    case "empty":
      return "info"
    case "error":
      return "error"
    case "ready":
      switch (pageMode) {
        case "review":
        case "submitting":
        case "paymentPending":
          return "warning"
        case "editing":
        case "paid":
          return "success"
        default:
          return assertNever(pageMode)
      }
    default:
      return assertNever(loadState)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected state: ${value}`)
}
