export function formatFen(priceFen: number): string {
  return `¥${(priceFen / 100).toFixed(2)}`
}

export function formatDate(value: string): string {
  return value.slice(0, 10)
}

export function formatRange(start: string, end: string): string {
  return `${formatDate(start)} 至 ${formatDate(end)}`
}

export function statusText(status: string): string {
  switch (status) {
    case "active":
      return "启用"
    case "cancelled":
      return "取消"
    case "closed":
      return "关闭"
    case "disabled":
      return "停用"
    case "draft":
      return "草稿"
    case "published":
      return "已发布"
    default:
      return status
  }
}
