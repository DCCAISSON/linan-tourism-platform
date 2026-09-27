import { computed, onMounted, reactive, ref } from "vue"
import { getCurrentStaff } from "@/api/auth"
import { RosterApiError } from "@/api/roster.errors"
import {
  createBusinessProduct,
  followupBusinessInquiry,
  getBusinessInquiry,
  listBusinessOwners,
  listBusinessOrganizations,
  listBusinessInquiries,
  listBusinessProducts,
  readableBusinessError,
  updateBusinessProduct,
  type BusinessCategory,
  type BusinessInquiry,
  type BusinessInquiryDetail,
  type BusinessOwner,
  type BusinessOrganization,
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
  const canRead = ref(false)
  const canWrite = ref(false)
  const canFollowup = ref(false)
  const accessLoading = ref(true)
  const accessError = ref("")
  const organizations = ref<readonly BusinessOrganization[]>([])
  const owners = ref<readonly BusinessOwner[]>([])
  const products = ref<readonly BusinessProduct[]>([])
  const inquiries = ref<readonly BusinessInquiry[]>([])
  const selectedProduct = ref<BusinessProduct>()
  const selectedInquiry = ref<BusinessInquiryDetail>()
  const detailLoading = ref(false)
  let selectedInquiryId = ""
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
  const followup = reactive<{ status: InquiryStatus; ownerStaffAccountId: string; note: string }>({ status: "processing", ownerStaffAccountId: "", note: "" })
  const parsedMedia = computed<readonly BusinessMedia[]>(() => mediaText.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [kind, url] = line.split(/\s+/, 2)
    return { kind: kind === "video" ? "video" : "image", url: url ?? "" }
  }))

  async function loadProducts(): Promise<void> {
    if (!canRead.value) return
    productsLoading.value = true
    productError.value = ""
    try { products.value = await listBusinessProducts() }
    catch (error) { productError.value = readableBusinessError(error) }
    finally { productsLoading.value = false }
  }

  async function loadInquiries(): Promise<void> {
    if (!canFollowup.value) return
    inquiriesLoading.value = true
    followupError.value = ""
    try {
      inquiries.value = await listBusinessInquiries()
      if (selectedInquiry.value !== undefined && !followupBusy.value) await selectInquiry(selectedInquiry.value)
    }
    catch (error) { followupError.value = readableBusinessError(error) }
    finally { inquiriesLoading.value = false }
  }

  async function saveProduct(): Promise<void> {
    if (!canWrite.value || productBusy.value) return
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
    if (!canWrite.value || productBusy.value) return
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

  function newProduct(): void {
    if (productBusy.value) return
    selectedProduct.value = undefined
    Object.assign(form, { organizationId: organizations.value.length === 1 ? organizations.value[0]?.id ?? "" : "", category: "tourism", title: "", offering: "", content: "", referencePriceFen: null, customerServicePhone: "", bookingUrl: "", bookingAuthorized: false, media: [], mediaAuthorized: false, status: "draft" })
    mediaText.value = ""
    priceYuan.value = ""
    productMessage.value = ""
    productError.value = ""
  }

  async function selectInquiry(inquiry: Pick<BusinessInquiry, "id">): Promise<void> {
    if (!canFollowup.value || followupBusy.value) return
    selectedInquiryId = inquiry.id
    selectedInquiry.value = undefined
    owners.value = []
    detailLoading.value = true
    followupError.value = ""
    followup.note = ""
    try {
      const [detail, candidates] = await Promise.all([getBusinessInquiry(inquiry.id), listBusinessOwners(inquiry.id)])
      if (selectedInquiryId !== inquiry.id) return
      selectedInquiry.value = detail
      owners.value = candidates
      followup.status = detail.status === "closed" ? "closed" : "processing"
      followup.ownerStaffAccountId = candidates.some(owner => owner.id === detail.ownerStaffAccountId) ? detail.ownerStaffAccountId ?? "" : ""
    } catch (error) {
      if (selectedInquiryId === inquiry.id) followupError.value = readableBusinessError(error)
    } finally {
      if (selectedInquiryId === inquiry.id) detailLoading.value = false
    }
  }

  async function saveFollowup(): Promise<void> {
    if (selectedInquiry.value === undefined || followupBusy.value) return
    const inquiryId = selectedInquiry.value.id
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
      await loadInquiries()
      followupBusy.value = false
      await selectInquiry({ id: inquiryId })
    } catch (error) {
      followupError.value = readableBusinessError(error)
    } finally {
      followupBusy.value = false
    }
  }

  async function initialize(): Promise<void> {
    accessLoading.value = true
    accessError.value = ""
    try {
      const staff = await getCurrentStaff()
      canRead.value = staff.permissionKeys.includes("business.read")
      canWrite.value = staff.permissionKeys.includes("business.write")
      canFollowup.value = staff.permissionKeys.includes("business.followup")
      await Promise.all([loadProducts(), loadInquiries(), canWrite.value ? loadOrganizations() : Promise.resolve()])
    } catch (error) { accessError.value = readableBusinessError(error) }
    finally { accessLoading.value = false }
  }

  async function loadOrganizations(): Promise<void> {
    try {
      organizations.value = await listBusinessOrganizations()
      if (!form.organizationId && organizations.value.length === 1) form.organizationId = organizations.value[0]?.id ?? ""
    } catch (error) { productError.value = readableBusinessError(error) }
  }

  onMounted(() => { void initialize() })
  return { canRead, canWrite, canFollowup, accessLoading, accessError, initialize, organizations, owners, selectedProduct, detailLoading, products, inquiries, selectedInquiry, productsLoading, inquiriesLoading, productBusy, followupBusy, productError, productMessage, followupError, followupMessage, mediaText, priceYuan, form, followup, loadProducts, loadInquiries, saveProduct, selectProduct, selectInquiry, saveFollowup, newProduct }
}

function toProductInput(form: BusinessProductForm, priceYuan: string, media: readonly BusinessMedia[]): BusinessProductInput {
  const trimmedPrice = priceYuan.trim()
  const validPrice = trimmedPrice === "" || (/^\d+(?:\.\d{1,2})?$/.test(trimmedPrice) && Number(trimmedPrice) <= 1000000)
  if (!validPrice) throw new RosterApiError(0, "参考价格须为不超过100万元的非负金额，最多两位小数；不填写请留空。")
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
