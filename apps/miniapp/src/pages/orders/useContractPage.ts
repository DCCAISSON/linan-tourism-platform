import { computed, ref } from "vue"
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { createContractApi, type ContractSignature, type OrderContract } from "../../contract-api"
import { hasContractSignature } from "../../contract-signature"
import { getEnrollmentDraftOwner, getWechatSessionToken } from "../../wechat-token"
import { readableError } from "../index/page-helpers"

export function useContractPage() {
  const orderId = ref("")
  const contract = ref<OrderContract | null>(null)
  const state = ref<"loading" | "ready" | "empty" | "error">("loading")
  const error = ref("")
  const signerName = ref("")
  const agreed = ref(false)
  const signature = ref<ContractSignature | null>(null)
  const submitting = ref(false)
  let request = 0
  let loadedOwner = "", loadedToken: string | undefined
  const signed = computed(() => contract.value?.status === "parent_signed_pending_agency")
  const canSign = computed(() => state.value === "ready" && !signed.value && !submitting.value && agreed.value && signerName.value.trim().length > 0 && hasContractSignature(signature.value))
  function clearDraft(): void { signerName.value = ""; agreed.value = false; signature.value = null }
  function discard(): void { ++request; clearDraft(); contract.value = null; state.value = "loading"; submitting.value = false }
  function sessionChanged(): void { discard(); error.value = "登录状态已变化，请重新加载合同。"; state.value = "error" }
  onLoad(query => { orderId.value = query?.["orderId"] ?? "" })
  onShow(() => { void load() })
  onHide(discard)
  onUnload(discard)
  async function load(): Promise<void> {
    const generation = ++request, id = orderId.value, owner = getEnrollmentDraftOwner(), token = getWechatSessionToken()
    clearDraft(); contract.value = null; state.value = "loading"; error.value = ""
    if (!id) { state.value = "error"; error.value = "请从订单详情打开合同。"; return }
    try {
      const result = await createContractApi().getContract(id)
      if (generation !== request || id !== orderId.value) return
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken()) { sessionChanged(); return }
      loadedOwner = owner; loadedToken = token
      contract.value = result; state.value = result ? "ready" : "empty"
    } catch (cause) {
      if (generation !== request) return
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken()) { sessionChanged(); return }
      state.value = "error"; error.value = readableError(cause, "合同加载失败，请重试。")
    }
  }
  async function sign(): Promise<void> {
    if (loadedOwner !== getEnrollmentDraftOwner() || loadedToken !== getWechatSessionToken()) { sessionChanged(); return }
    const current = contract.value, writing = signature.value
    if (!canSign.value || !current || !writing) return
    const generation = ++request, owner = loadedOwner, token = loadedToken
    submitting.value = true; error.value = ""
    try {
      const result = await createContractApi().signContract(current.orderId, { snapshotHash: current.snapshotHash, signerName: signerName.value.trim(), agreed: true, signature: writing })
      if (generation !== request || current.snapshotHash !== contract.value?.snapshotHash || current.orderId !== orderId.value) return
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken()) { sessionChanged(); return }
      contract.value = result; clearDraft()
    } catch (cause) {
      if (generation !== request) return
      if (owner !== getEnrollmentDraftOwner() || token !== getWechatSessionToken()) { sessionChanged(); return }
      error.value = readableError(cause, "签字未能提交，请重试；也可重新加载确认结果。")
    } finally {
      if (generation === request) submitting.value = false
    }
  }
  function backToOrder(): void {
    if (orderId.value) uni.redirectTo({ url: `/pages/orders/detail?orderId=${encodeURIComponent(orderId.value)}` })
    else uni.switchTab({ url: "/pages/orders/index" })
  }
  return { orderId, contract, state, error, signerName, agreed, signature, submitting, signed, canSign, load, sign, backToOrder }
}
