import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const enrollmentFormSource = readFileSync(resolve(__dirname, "../src/pages/index/EnrollmentForm.vue"), "utf8")

describe("enrollment form copy", () => {
  it("uses family-facing participant labels and required guidance", () => {
    expect(enrollmentFormSource).not.toContain("成员编号")
    expect(enrollmentFormSource).not.toContain("成员称呼")
    expect(enrollmentFormSource).toContain("<text class=\"required-mark\">*</text>姓名")
    expect(enrollmentFormSource).toContain("为必填项，请填写参加人姓名、证件号码和联系电话。")
    expect(enrollmentFormSource).toContain("请输入18位身份证号码")
    expect(enrollmentFormSource).toContain("请输入11位手机号码")
  })
})
