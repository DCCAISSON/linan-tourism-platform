import { describe, expect, it, vi } from "vitest"
import { createContractApi, parseOrderContract } from "../src/contract-api"
import { handwriting, pendingContract, signedContract } from "./contract-fixture"

describe("contract API boundary", () => {
  it("parses the exact order snapshot and sends only explicit signature confirmation", async () => {
    const request = vi.fn(async () => ({ statusCode: 200, data: { contract: signedContract } }))
    const input = { snapshotHash: "snapshot-1", signerName: "李女士", agreed: true as const, signature: handwriting }
    const result = await createContractApi({ baseUrl: "https://api.invalid", request, wechatSessionToken: "owner-a" }).signContract("order-1", input)
    expect(request).toHaveBeenCalledWith({ url: "https://api.invalid/orders/order-1/contract/sign", method: "POST", header: { "Content-Type": "application/json", Authorization: "Bearer owner-a" }, data: input })
    expect(result).toEqual(signedContract)
  })
  it("preserves an explicit null for historical orders", async () => {
    expect(await createContractApi({ request: async () => ({ statusCode: 200, data: { contract: null } }) }).getContract("old-order")).toBeNull()
  })
  it("does not turn a failed API response into no-contract permission", async () => {
    await expect(createContractApi({ request: async () => ({ statusCode: 503, data: {} }) }).getContract("order-1")).rejects.toThrow()
  })
  it("rejects a missing contract field", () => { expect(() => parseOrderContract(undefined)).toThrow() })
  it("rejects another order's contract", async () => {
    await expect(createContractApi({ request: async () => ({ statusCode: 200, data: { contract: pendingContract } }) }).getContract("other-order")).rejects.toThrow("合同与当前订单不一致")
  })
  it("does not accept a signed status without the saved handwriting", () => {
    expect(() => parseOrderContract({ ...signedContract, signature: null })).toThrow()
  })
  it("rejects an unsupported signing scope", () => {
    expect(() => parseOrderContract({ ...pendingContract, signingScope: "sign_for_everyone" })).toThrow("合同签字范围无法确认")
  })
})
