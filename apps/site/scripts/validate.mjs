import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..", "src")
const html = readFileSync(resolve(root, "index.html"), "utf8")
const css = readFileSync(resolve(root, "styles.css"), "utf8")

for (const required of ["杭州临安旅游集散中心有限公司", "研学服务", "联系我们", "filing-icp", "filing-public-security"]) {
  if (!html.includes(required)) throw new Error(`public site is missing: ${required}`)
}
if (css.includes("linear-gradient") || css.includes("radial-gradient")) throw new Error("public site must use the shared solid-color design system")

const publicCopy = `${html}\n${css}`
for (const forbidden of ["体验版", "测试", "测试名单", "演示", "模拟", "虚构", "待开发", "内推", "开发版"]) {
  if (publicCopy.includes(forbidden)) throw new Error(`public site contains internal wording: ${forbidden}`)
}
