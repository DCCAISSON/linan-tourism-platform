import { beforeEach, describe, expect, it, vi } from "vitest"
import { useContractPage } from "../src/pages/orders/useContractPage"
import type { OrderContract, SignContractInput } from "../src/contract-types"
import { handwriting, pendingContract, signedContract } from "./contract-fixture"

const calls = vi.hoisted(() => ({ getContract: vi.fn<(id: string) => Promise<OrderContract | null>>(), signContract: vi.fn<(id: string, input: SignContractInput) => Promise<OrderContract | null>>(), token: "owner-a", hide: () => {} }))
vi.mock("../src/contract-api", () => ({ createContractApi: () => calls }))
vi.mock("../src/wechat-token", () => ({ getWechatSessionToken: () => calls.token, getEnrollmentDraftOwner: () => `family:${calls.token}` }))
vi.mock("@dcloudio/uni-app", () => ({ onLoad: () => {}, onShow: () => {}, onUnload: () => {}, onHide: (callback: () => void) => { calls.hide = callback } }))
beforeEach(() => { calls.token = "owner-a"; calls.getContract.mockReset().mockResolvedValue(pendingContract); calls.signContract.mockReset().mockResolvedValue(signedContract) })
async function readyPage() {
  const page = useContractPage()
  page.orderId.value = "order-1"
  await page.load()
  return page
}
describe("contract signing page", () => {
  it("requires handwriting, typed name and explicit agreement", async () => {
    const page = await readyPage()
    page.signerName.value = "李女士"; page.agreed.value = true
    await page.sign()
    expect(calls.signContract).not.toHaveBeenCalled()
    expect(page.canSign.value).toBe(false)
  })
  it("saves the displayed snapshot and makes the returned signed record read only", async () => {
    const page = await readyPage()
    page.signerName.value = "李女士"; page.agreed.value = true; page.signature.value = handwriting
    await page.sign()
    expect(calls.signContract).toHaveBeenCalledWith("order-1", { snapshotHash: "snapshot-1", signerName: "李女士", agreed: true, signature: handwriting })
    expect(page.signed.value).toBe(true)
    expect(page.canSign.value).toBe(false)
    expect(page.signature.value).toBeNull()
  })
  it("ignores a delayed contract response after an account switch", async () => {
    let resolve: (value: OrderContract) => void = () => {}
    calls.getContract.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const page = useContractPage(); page.orderId.value = "order-1"
    const request = page.load(); calls.token = "owner-b"; resolve(pendingContract); await request
    expect(page.contract.value).toBeNull()
  })
  it("does not send retained handwriting for a different account", async () => {
    const page = await readyPage()
    page.signerName.value = "李女士"; page.agreed.value = true; page.signature.value = handwriting
    calls.token = "owner-b"; await page.sign()
    expect(calls.signContract).not.toHaveBeenCalled()
    expect(page.signature.value).toBeNull()
    expect(page.contract.value).toBeNull()
  })
  it("discards a delayed signing response after leaving the page", async () => {
    let resolve: (value: OrderContract) => void = () => {}
    calls.signContract.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const page = await readyPage(); page.signerName.value = "李女士"; page.agreed.value = true; page.signature.value = handwriting
    const request = page.sign(); calls.hide(); resolve(signedContract); await request
    expect(page.contract.value).toBeNull()
    expect(page.signature.value).toBeNull()
  })
  it("clears handwriting when the signing response belongs to an earlier account", async () => {
    let resolve: (value: OrderContract) => void = () => {}
    calls.signContract.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const page = await readyPage(); page.signerName.value = "李女士"; page.agreed.value = true; page.signature.value = handwriting
    const request = page.sign(); calls.token = "owner-b"; resolve(signedContract); await request
    expect(page.contract.value).toBeNull(); expect(page.signature.value).toBeNull(); expect(page.state.value).toBe("error")
  })
  it("clears handwriting and consent when reloading another snapshot", async () => {
    const page = await readyPage(); page.signature.value = handwriting; page.agreed.value = true
    calls.getContract.mockResolvedValue({ ...pendingContract, snapshotHash: "snapshot-2" })
    await page.load()
    expect(page.signature.value).toBeNull(); expect(page.agreed.value).toBe(false)
  })
  it("keeps a failed submission retryable without claiming it was signed", async () => {
    const page = await readyPage(); page.signerName.value = "李女士"; page.agreed.value = true; page.signature.value = handwriting
    calls.signContract.mockRejectedValue(new Error("offline")); await page.sign()
    expect(page.signed.value).toBe(false); expect(page.error.value).not.toBe(""); expect(page.canSign.value).toBe(true)
  })
})
