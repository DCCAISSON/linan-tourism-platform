<template>
  <ConfigurationCard
    empty-text="暂无团期，请先新增团期。"
    :count="tourSessions.length"
    :error="error"
    :loading="loading"
    title="团期"
    title-id="session-title"
    wide
  >
    <template #form>
      <SessionCreateForm
        :catalog-items="catalogItems"
        :form-error="formError"
        :schools="schools"
        :submitting="submitting"
        @create="emit('create', $event)"
      />
      <SessionEditForm
        :form-error="formError"
        :submitting="submitting"
        :tour-sessions="tourSessions"
        @update="emit('update', $event)"
      />
      <form class="configuration-form configuration-form--grid configuration-form--notice" @submit.prevent="createNotice">
        <fieldset :disabled="submitting || tourSessions.length === 0">
          <legend class="configuration-form__legend">家长告知书版本</legend>
          <p class="state-text notice-editor-help">创建后需在团期列表中启用，家长才会看到新版本。已提交订单保留报名时确认的版本。</p>
          <div class="field">
            <label for="notice-session">告知书团期</label>
            <select id="notice-session" v-model="noticeSessionId" required>
              <option value="">请选择团期</option>
              <option v-for="session in tourSessions" :key="session.id" :value="session.id">
                {{ session.code }} · {{ catalogTitleById(session.catalogItemId) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="notice-version">版本号</label>
            <input id="notice-version" v-model="noticeVersion" required maxlength="64" placeholder="v1" />
          </div>
          <div class="field">
            <label for="notice-title">标题</label>
            <input id="notice-title" v-model="noticeTitle" required maxlength="255" />
          </div>
          <div class="field">
            <label for="notice-destination">目的地</label>
            <input id="notice-destination" v-model="noticeDestination" required maxlength="255" placeholder="请输入本团期目的地" />
          </div>
          <div class="field">
            <label for="notice-departure">集合地点</label>
            <input id="notice-departure" v-model="noticeDeparturePlace" required maxlength="255" placeholder="请输入集合地点" />
          </div>
          <div class="field">
            <label for="notice-meal">餐食说明</label>
            <input id="notice-meal" v-model="noticeMealNote" required maxlength="255" placeholder="请输入餐食说明" />
          </div>
          <div class="field configuration-form__wide">
            <label>行程安排（7段）</label>
            <input v-for="(_, index) in noticeItinerary" :key="index" v-model="noticeItinerary[index]" required maxlength="255" :placeholder="`第 ${index + 1} 段行程`" />
          </div>
          <div class="field">
            <label for="notice-prices">费用说明（每行一条）</label>
            <textarea id="notice-prices" v-model="noticeUnitPricesText" required rows="4" placeholder="学生128元/人" />
            <small class="state-text">仅作文字展示，不改变计费。请与团期单价保持一致。</small>
          </div>
          <div class="field">
            <label for="notice-packages">组合示例（每行一条）</label>
            <textarea id="notice-packages" v-model="noticePackageExamplesText" required rows="4" placeholder="1名学生128元" />
          </div>
          <div class="field">
            <label for="notice-reminders">报名须知（每行一条）</label>
            <textarea id="notice-reminders" v-model="noticeRemindersText" required rows="4" placeholder="请按工作人员通知时间集合" />
          </div>
          <p v-if="formError" class="form-error">{{ formError }}</p>
          <button type="submit" :disabled="submitting || tourSessions.length === 0">{{ submitting ? '创建中…' : '创建告知书版本（暂不生效）' }}</button>
        </fieldset>
      </form>
      <section v-if="previewSession" class="notice-preview" aria-label="家长内容预览">
        <h4>家长内容预览</h4>
        <p class="state-text">以下使用当前填写内容，尚未生效。活动介绍来自课程，价格来自已保存团期。</p>
        <strong>{{ catalogTitleById(previewSession.catalogItemId) }}</strong>
        <p>{{ formatRange(previewSession.startsAt, previewSession.endsAt) }}</p>
        <p class="record-price">{{ formatFen(previewSession.priceFen) }} / 人 · 学生、成人同价</p>
        <dl>
          <dt>活动介绍</dt><dd>{{ previewCatalog?.description || '尚未填写，请在课程中补充。' }}</dd>
          <dt>行程安排</dt>
          <dd>
            <p>目的地：{{ noticeDestination || '待填写' }} · 集合地点：{{ noticeDeparturePlace || '待填写' }}</p>
            <p>餐食：{{ noticeMealNote || '待填写' }}</p>
            <ol><li v-for="(item, index) in noticeItinerary.filter(item => item.trim())" :key="index">{{ item }}</li></ol>
          </dd>
          <dt>费用说明</dt>
          <dd><p v-for="(item, index) in [...readLines(noticeUnitPricesText), ...readLines(noticePackageExamplesText)]" :key="index">{{ item }}</p><p v-if="!noticeUnitPricesText.trim()">待填写费用说明。</p></dd>
          <dt>报名须知</dt>
          <dd><p v-for="(item, index) in readLines(noticeRemindersText)" :key="index">{{ item }}</p><p v-if="!noticeRemindersText.trim()">待填写报名须知。</p></dd>
          <dt>退费说明</dt><dd>按取消参加人的历史实付金额计算退款，不按提前天数扣费。家长可在“我的订单”按人申请，审核及退款进度以订单详情为准。</dd>
        </dl>
      </section>
    </template>
    <ul class="record-list record-list--columns">
      <li v-for="session in tourSessions" :key="session.id">
        <strong>{{ catalogTitleById(session.catalogItemId) }}</strong>
        <span class="record-price">{{ formatFen(session.priceFen) }} / 人（学生、成人同价）</span>
        <span>{{ session.capacity }} 人</span>
        <span class="notice-summary notice-summary--wide">招生范围：{{ session.enrollmentScope == null ? "全校" : `${session.enrollmentScope.length} 个指定年级（班级范围见编辑表单）` }}</span>
        <span v-if="session.minimumParticipants != null" class="notice-summary notice-summary--wide">
          最低人数参考：已付款有效人数 {{ session.occupiedCapacity ?? '暂未提供' }} / 最低人数 {{ session.minimumParticipants }}
          <template v-if="session.occupiedCapacity != null"> · {{ session.occupiedCapacity >= session.minimumParticipants ? '已达参考人数' : '未达参考人数' }}</template>
        </span>
        <span>{{ formatRange(session.startsAt, session.endsAt) }}</span>
        <span>{{ formatRange(session.enrollmentOpensAt, session.enrollmentClosesAt) }}</span>
        <span>{{ statusText(session.status) }}</span>
        <span class="notice-summary">
          生效告知书：{{ session.activeNotice ? `${session.activeNotice.title}（${session.activeNotice.version}）` : '未启用，家长暂不能报名' }}
        </span>
        <span class="notice-summary notice-summary--wide">
          <template v-for="notice in noticeVersionsBySession(session.id)" :key="notice.id">
            <button type="button" class="record-action" :disabled="submitting || session.activeNoticeId === notice.id" @click="emit('activateNotice', { tourSessionId: session.id, noticeVersionId: notice.id })">
              {{ session.activeNoticeId === notice.id ? `${notice.version} 已生效` : `启用 ${notice.version}` }}
            </button>
            <span>{{ notice.title }} · {{ notice.contentJson.destination }}</span>
          </template>
        </span>
        <span class="record-actions">
          <button type="button" class="record-action" :disabled="submitting" @click="publish(session.id)">
            发布
          </button>
          <button type="button" class="record-action" :disabled="submitting" @click="close(session.id)">
            关闭
          </button>
          <button type="button" class="record-action" :disabled="submitting" @click="emit('delete', session.id)">
            删除
          </button>
        </span>
      </li>
    </ul>
  </ConfigurationCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { CatalogItem, NoticeContent, NoticeVersion, School, TourSession, TourSessionPayload, TourSessionUpdatePayload } from "@/api/configuration"
import ConfigurationCard from "./ConfigurationCard.vue"
import { formatFen, formatRange, statusText } from "./format"
import SessionCreateForm from "./SessionCreateForm.vue"
import SessionEditForm from "./SessionEditForm.vue"

const props = defineProps<{
  readonly catalogItems: readonly CatalogItem[]
  readonly error: string
  readonly formError: string
  readonly loading: boolean
  readonly schools: readonly School[]
  readonly submitting: boolean
  readonly tourSessions: readonly TourSession[]
  readonly noticeVersions: readonly NoticeVersion[]
}>()

const emit = defineEmits<{
  create: [payload: TourSessionPayload]
  delete: [id: string]
  update: [change: { readonly id: string; readonly payload: TourSessionUpdatePayload }]
  createNotice: [change: { readonly tourSessionId: string; readonly payload: { readonly version: string; readonly title: string; readonly contentJson: NoticeContent } }]
  activateNotice: [change: { readonly tourSessionId: string; readonly noticeVersionId: string }]
}>()

const noticeSessionId = ref("")
const noticeVersion = ref("v1")
const noticeTitle = ref("")
const noticeDestination = ref("")
const noticeDeparturePlace = ref("")
const noticeMealNote = ref("")
const noticeItinerary = ref(["", "", "", "", "", "", ""])
const noticeUnitPricesText = ref("")
const noticePackageExamplesText = ref("")
const noticeRemindersText = ref("")
const previewSession = computed(() => props.tourSessions.find(session => session.id === noticeSessionId.value))
const previewCatalog = computed(() => props.catalogItems.find(item => item.id === previewSession.value?.catalogItemId))

function createNotice(): void {
  emit("createNotice", {
    tourSessionId: noticeSessionId.value,
    payload: {
      version: noticeVersion.value,
      title: noticeTitle.value,
      contentJson: {
        destination: noticeDestination.value.trim(),
        departurePlace: noticeDeparturePlace.value.trim(),
        mealNote: noticeMealNote.value.trim(),
        itinerary: noticeItinerary.value.map(item => item.trim()),
        unitPrices: readLines(noticeUnitPricesText.value),
        packageExamples: readLines(noticePackageExamplesText.value),
        reminders: readLines(noticeRemindersText.value),
      },
    },
  })
}

function readLines(value: string): readonly string[] {
  return value.split(/\r?\n/u).map(item => item.trim()).filter(Boolean)
}

function noticeVersionsBySession(sessionId: string): readonly NoticeVersion[] {
  return props.noticeVersions.filter((notice) => notice.tourSessionId === sessionId)
}

function publish(id: string): void {
  emit("update", { id, payload: { status: "published" } })
}

function close(id: string): void {
  emit("update", { id, payload: { status: "closed" } })
}

function catalogTitleById(itemId: string): string {
  return props.catalogItems.find(item => item.id === itemId)?.title ?? "未关联课程"
}
</script>

<style scoped>
.notice-editor-help { grid-column: 1 / -1; }
.notice-preview { padding: 16px; background: var(--surface-secondary); border-left: 4px solid var(--accent-primary); }
.notice-preview h4 { margin: 0 0 8px; font-size: 18px; }
.notice-preview p { margin: 8px 0; }
.notice-preview dl { margin: 16px 0 0; }
.notice-preview dt { margin-top: 16px; font-weight: 600; }
.notice-preview dd { margin: 4px 0 0; color: var(--text-secondary); overflow-wrap: anywhere; }
.notice-preview ol { padding-left: 24px; }
</style>
