import { computed, onMounted, reactive, ref } from "vue"
import {
  createBusinessProduct,
  followupBusinessInquiry,
  listBusinessInquiries,
  listBusinessProducts,
  readableBusinessError,
  updateBusinessProduct,
  type BusinessCategory,
  type BusinessInquiry,
  type BusinessMedia,
  type BusinessProduct,
  type BusinessProductInput,
  type BusinessStatus,
  type InquiryStatus,
} from "@/api/business"
import { formatFen } from "@/views/roster/format"

type BusinessProductForm = { -readonly [Key in keyof BusinessProductInput]: BusinessProductInput[Key] }

export const categoryOptions = [
  { label: "旅游", value: "tourism" },
  { label: "疗休养", value: "wellness" },
  { label: "民宿", value: "homestay" },
] as const

export function useBusinessView() {
  const products = ref<readonly BusinessProduct[]>([])
  const inquiries = ref<readonly BusinessInquiry[]>([])
  const selectedProduct = ref<BusinessProduct>()
  const selectedInquiry = ref<BusinessInquiry>()
  const productsLoading = ref(false)
  const inquiriesLoading = ref(false)
  const productBusy = ref(false)
  const followupBusy = ref(false)
  const productError = ref("")
  const productMessage = ref("")
  const followupError = ref("")
  const followupMessage = ref("")
  const mediaText = ref("")
  const priceYuan = ref("")
  const form = reactive<BusinessProductForm>({
    organizationId: "",
    category: "tourism",
    title: "",
    offering: "",
    content: "",
    referencePriceFen: null,
    customerServicePhone: "",
    bookingUrl: "",
    bookingAuthorized: false,
    media: [],
    mediaAuthorized: false,
    status: "draft",
  })
  const followup = reactive({ status: "processing" as InquiryStatus, ownerStaffAccountId: "", note: "" })
  const parsedMedia = computed<readonly BusinessMedia[]>(() => mediaText.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [kind, url] = line.split(/\s+/, 2)
    return { kind: kind === "video" ? "video" : "image", url: url ?? "" }
  }))

  async function loadProducts(): Promise<void> {
    productsLoading.value = true
    productError.value = ""
    try { products.value = await listBusinessProducts() }
    catch (error) { productError.value = readableBusinessError(error) }
    finally { productsLoading.value = false }
  }

  async function loadInquiries(): Promise<void> {
    inquiriesLoading.value = true
    followupError.value = ""
    try { inquiries.value = await listBusinessInquiries() }
    catch (error) { followupError.value = readableBusinessError(error) }
    finally { inquiriesLoading.value = false }
  }

  async function saveProduct(): Promise<void> {
    productBusy.value = true
    productError.value = ""
    productMessage.value = ""
    try {
      const input = toProductInput(form, priceYuan.value, parsedMedia.value)
      selectedProduct.value = selectedProduct.value === undefined
        ? await createBusinessProduct(input)
        : await updateBusinessProduct(selectedProduct.value.id, input, selectedProduct.value.version)
      productMessage.value = "业务内容已保存。"
      await loadProducts()
    } catch (error) {
      productError.value = readableBusinessError(error)
    } finally {
      productBusy.value = false
    }
  }

  function selectProduct(product: BusinessProduct): void {
    selectedProduct.value = product
    form.organizationId = product.organizationId
    form.category = product.category
    form.title = product.title
    form.offering = product.offering
    form.content = product.content
    form.referencePriceFen = product.referencePriceFen
    form.customerServicePhone = product.customerServicePhone
    form.bookingUrl = product.bookingUrl
    form.bookingAuthorized = product.bookingAuthorized
    form.media = product.media
    form.mediaAuthorized = product.mediaAuthorized
    form.status = product.status
    priceYuan.value = product.referencePriceFen === null ? "" : String(product.referencePriceFen / 100)
    mediaText.value = product.media.map((item) => `${item.kind} ${item.url}`).join("\n")
  }

  function selectInquiry(inquiry: BusinessInquiry): void {
    selectedInquiry.value = inquiry
    followup.status = inquiry.status === "closed" ? "closed" : "processing"
    followup.ownerStaffAccountId = inquiry.ownerStaffAccountId ?? ""
    followup.note = ""
  }

  async function saveFollowup(): Promise<void> {
    if (selectedInquiry.value === undefined) return
    followupBusy.value = true
    followupError.value = ""
    followupMessage.value = ""
    try {
      await followupBusinessInquiry(selectedInquiry.value.id, {
        idempotencyKey: crypto.randomUUID(),
        expectedVersion: selectedInquiry.value.version,
        status: followup.status,
        ownerStaffAccountId: followup.ownerStaffAccountId,
        note: followup.note,
      })
      followupMessage.value = "跟进记录已保存。"
      selectedInquiry.value = undefined
      await loadInquiries()
    } catch (error) {
      followupError.value = readableBusinessError(error)
    } finally {
      followupBusy.value = false
    }
  }

  onMounted(() => { void Promise.all([loadProducts(), loadInquiries()]) })
  return { products, inquiries, selectedInquiry, productsLoading, inquiriesLoading, productBusy, followupBusy, productError, productMessage, followupError, followupMessage, mediaText, priceYuan, form, followup, loadProducts, loadInquiries, saveProduct, selectProduct, selectInquiry, saveFollowup }
}

function toProductInput(form: BusinessProductForm, priceYuan: string, media: readonly BusinessMedia[]): BusinessProductInput {
  const trimmedPrice = priceYuan.trim()
  return { ...form, referencePriceFen: trimmedPrice === "" ? null : Math.round(Number(trimmedPrice) * 100), media }
}

export function categoryText(value: BusinessCategory): string {
  switch (value) {
    case "tourism": return "旅游"
    case "wellness": return "疗休养"
    case "homestay": return "民宿"
  }
}

export function statusText(value: BusinessStatus): string {
  switch (value) {
    case "draft": return "草稿"
    case "published": return "已发布"
    case "archived": return "已归档"
  }
}

export function inquiryStatusText(value: InquiryStatus): string {
  switch (value) {
    case "inquiry": return "咨询"
    case "processing": return "处理中"
    case "closed": return "已结束"
  }
}

export { formatFen }
