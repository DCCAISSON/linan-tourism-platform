export function formatFen(amountFen: number): string {
  return `¥${(amountFen / 100).toFixed(2)}`
}
