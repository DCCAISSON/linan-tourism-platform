<template>
  <main class="crm-page">
    <section class="crm-header">
      <div>
        <p class="crm-kicker">成人 CRM</p>
        <h1>成年客户与人工跟进</h1>
        <p>仅维护授权人员手动录入的成年客户。营销授权只记录状态，不触发消息发送。</p>
      </div>
      <button class="crm-button" type="button" :disabled="exporting || !selectedOrganizationId" @click="exportCustomers">导出脱敏CSV</button>
    </section>

    <section class="crm-panel">
      <label>业务范围<select v-model="selectedOrganizationId" @change="reloadForOrganization"><option value="">请选择</option><option v-for="item in organizations" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>关键词<input v-model="filters.keyword" placeholder="姓名或来源" /></label>
      <label>标签<input v-model="filters.tag" placeholder="如：亲子游" /></label>
      <label>负责人<select v-model="filters.ownerId"><option value="">全部</option><option v-for="owner in options.owners" :key="owner.id" :value="owner.id">{{ owner.displayName }}</option></select></label>
      <label>营销授权<select v-model="filters.marketingConsent"><option value="">全部</option><option value="unknown">未知</option><option value="granted">已授权</option><option value="declined">拒绝</option><option value="withdrawn">撤回</option></select></label>
      <label class="crm-check"><input v-model="filters.dueOnly" type="checkbox" />只看待跟进</label>
      <button class="crm-button crm-button--secondary" type="button" :disabled="loading || !selectedOrganizationId" @click="loadCustomers">筛选</button>
    </section>

    <p v-if="message" class="crm-message">{{ message }}</p>

    <section class="crm-grid">
      <form class="crm-card crm-form" @submit.prevent="createCustomer">
        <h2>新增成年客户</h2>
        <label>姓名<input v-model="draft.displayName" required /></label>
        <label>出生日期<input v-model="draft.birthDate" required type="date" /></label>
        <label>手机号<input v-model="draft.phone" required maxlength="11" /></label>
        <label>来源<input v-model="draft.source" required placeholder="主动咨询、线下报名等" /></label>
        <label>标签<input v-model="draft.tagsText" placeholder="多个标签用顿号或逗号分隔" /></label>
        <label>营销授权<select v-model="draft.marketingConsent"><option value="unknown">未知</option><option value="granted">已授权</option><option value="declined">拒绝</option><option value="withdrawn">撤回</option></select></label>
        <label>负责人<select v-model="draft.ownerId"><option value="">未指定</option><option v-for="owner in options.owners" :key="owner.id" :value="owner.id">{{ owner.displayName }}</option></select></label>
        <label>显式关联家庭<select v-model="draft.familyId"><option value="">不关联</option><option v-for="family in options.families" :key="family.id" :value="family.id">{{ family.code }} {{ family.primaryContactName }}</option></select></label>
        <label class="crm-check"><input v-model="draft.adultConfirmed" type="checkbox" />已人工确认成年客户</label>
        <button class="crm-button" type="submit" :disabled="saving || !selectedOrganizationId">保存客户</button>
      </form>

      <section class="crm-list">
        <article v-for="customer in customers" :key="customer.id" class="crm-card" :class="{ 'crm-card--active': selected?.id === customer.id }">
          <button class="crm-row-button" type="button" @click="selectCustomer(customer.id)">
            <span><strong>{{ customer.displayName }}</strong><small>{{ customer.phoneMasked }} · {{ customer.source }}</small></span>
            <span class="crm-consent">{{ consentLabel(customer.marketingConsent) }}</span>
          </button>
          <p class="crm-tags"><span v-for="tag in customer.tags" :key="tag">{{ tag }}</span></p>
          <p class="crm-muted">下次跟进：{{ customer.nextFollowupAt ?? "未设置" }}</p>
        </article>
        <p v-if="!loading && customers.length === 0" class="crm-empty">暂无符合条件的成人客户。</p>
      </section>
    </section>

    <section v-if="selected" class="crm-detail crm-card">
      <div class="crm-detail-head">
        <div>
          <h2>{{ selected.displayName }}</h2>
          <p>{{ selected.phoneMasked }} · {{ selected.source }} · {{ consentLabel(selected.marketingConsent) }}</p>
        </div>
        <button class="crm-button crm-button--secondary" type="button" @click="readPhone">受权查看电话</button>
      </div>
      <p v-if="plaintextPhone" class="crm-message">原文电话：{{ plaintextPhone }}</p>
      <form class="crm-followup" @submit.prevent="saveFollowup">
        <label>跟进内容<textarea v-model="followup.content" required /></label>
        <label>下次跟进<input v-model="followup.nextFollowupAt" type="datetime-local" /></label>
        <button class="crm-button" type="submit" :disabled="savingFollowup">保存跟进</button>
      </form>
      <div class="crm-columns">
        <section>
          <h3>跟进记录</h3>
          <p v-if="selected.followups.length === 0" class="crm-muted">暂无跟进记录。</p>
          <ol><li v-for="item in selected.followups" :key="item.id">{{ item.content }}<small>{{ item.createdAt }}</small></li></ol>
        </section>
        <section>
          <h3>订单/参团历史</h3>
          <p v-if="history.length === 0" class="crm-muted">未关联家庭或暂无历史。</p>
          <ol><li v-for="item in history" :key="item.orderId">{{ item.activityTitle }} · {{ item.code }} · {{ item.participantCount }}人 · {{ formatFen(item.paidFen) }}</li></ol>
        </section>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue"
import {
  createCrmCustomer,
  createCrmFollowup,
  downloadCrmExport,
  getCrmDetail,
  getCrmHistory,
  getCrmOptions,
  listCrmCustomers,
  listCrmOrganizations,
  readCrmPhone,
  readableCrmError,
  type CrmCustomer,
  type CrmCustomerDetail,
  type CrmHistoryRow,
  type CrmOptions,
  type CrmOrganization,
  type MarketingConsent,
} from "@/api/crm"
import { formatFen } from "@/views/configuration/format"
import "@/styles/crm.css"

const organizations = ref<readonly CrmOrganization[]>([])
const customers = ref<readonly CrmCustomer[]>([])
const selected = ref<CrmCustomerDetail | null>(null)
const history = ref<readonly CrmHistoryRow[]>([])
const options = ref<CrmOptions>({ families: [], owners: [] })
const selectedOrganizationId = ref("")
const message = ref("")
const plaintextPhone = ref("")
const loading = ref(false)
const saving = ref(false)
const savingFollowup = ref(false)
const exporting = ref(false)

const filters = reactive({ keyword: "", tag: "", ownerId: "", marketingConsent: "", dueOnly: false })
const draft = reactive({ displayName: "", birthDate: "", phone: "", source: "", tagsText: "", marketingConsent: "unknown" as MarketingConsent, ownerId: "", familyId: "", adultConfirmed: true })
const followup = reactive({ content: "", nextFollowupAt: "" })

onMounted(async () => {
  try {
    organizations.value = await listCrmOrganizations()
    selectedOrganizationId.value = organizations.value[0]?.id ?? ""
    if (selectedOrganizationId.value) await reloadForOrganization()
  } catch (error) {
    message.value = readableCrmError(error)
  }
})

async function reloadForOrganization(): Promise<void> {
  selected.value = null
  history.value = []
  plaintextPhone.value = ""
  if (!selectedOrganizationId.value) return
  options.value = await getCrmOptions(selectedOrganizationId.value)
  await loadCustomers()
}

async function loadCustomers(): Promise<void> {
  loading.value = true
  message.value = ""
  try {
    const result = await listCrmCustomers({ organizationId: selectedOrganizationId.value, keyword: filters.keyword, tag: filters.tag, ownerId: filters.ownerId, marketingConsent: filters.marketingConsent, dueOnly: filters.dueOnly, page: 1 })
    customers.value = result.customers
  } catch (error) {
    message.value = readableCrmError(error)
  } finally {
    loading.value = false
  }
}

async function createCustomer(): Promise<void> {
  if (!draft.adultConfirmed) {
    message.value = "\u8bf7\u5148\u4eba\u5de5\u786e\u8ba4\u6210\u5e74\u5ba2\u6237\u3002"
    return
  }
  saving.value = true
  message.value = ""
  try {
    const customer = await createCrmCustomer({ organizationId: selectedOrganizationId.value, displayName: draft.displayName, birthDate: draft.birthDate, adultConfirmed: true, phone: draft.phone, source: draft.source, tags: splitTags(draft.tagsText), marketingConsent: draft.marketingConsent, ownerId: optionalId(draft.ownerId), familyId: optionalId(draft.familyId), idempotencyKey: `crm-${globalThis.crypto.randomUUID()}` })
    await loadCustomers()
    await selectCustomer(customer.id)
    Object.assign(draft, { displayName: "", birthDate: "", phone: "", source: "", tagsText: "", marketingConsent: "unknown", ownerId: "", familyId: "", adultConfirmed: true })
  } catch (error) {
    message.value = readableCrmError(error)
  } finally {
    saving.value = false
  }
}

async function selectCustomer(id: string): Promise<void> {
  selected.value = await getCrmDetail(id)
  history.value = await getCrmHistory(id)
  plaintextPhone.value = ""
}

async function saveFollowup(): Promise<void> {
  if (selected.value === null) return
  savingFollowup.value = true
  try {
    await createCrmFollowup(selected.value.id, { content: followup.content, nextFollowupAt: followup.nextFollowupAt === "" ? null : new Date(followup.nextFollowupAt).toISOString(), idempotencyKey: `follow-${globalThis.crypto.randomUUID()}` })
    followup.content = ""
    followup.nextFollowupAt = ""
    await selectCustomer(selected.value.id)
    await loadCustomers()
  } catch (error) {
    message.value = readableCrmError(error)
  } finally {
    savingFollowup.value = false
  }
}

async function readPhone(): Promise<void> {
  if (selected.value === null) return
  plaintextPhone.value = await readCrmPhone(selected.value.id, "人工回访")
}

async function exportCustomers(): Promise<void> {
  exporting.value = true
  try {
    await downloadCrmExport({ organizationId: selectedOrganizationId.value, keyword: filters.keyword, tag: filters.tag, ownerId: filters.ownerId, marketingConsent: filters.marketingConsent, dueOnly: filters.dueOnly, page: 1 })
  } catch (error) {
    message.value = readableCrmError(error)
  } finally {
    exporting.value = false
  }
}

function splitTags(value: string): readonly string[] {
  return value.split(/[、,，]/).map(item => item.trim()).filter(item => item.length > 0)
}

function optionalId(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function consentLabel(value: MarketingConsent): string {
  if (value === "granted") return "已授权"
  if (value === "declined") return "拒绝"
  if (value === "withdrawn") return "撤回"
  return "未知"
}
</script>
