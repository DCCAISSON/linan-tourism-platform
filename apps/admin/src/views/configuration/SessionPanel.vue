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
      <form class="inline-form" @submit.prevent="createNotice">
        <label>
          <span>告知书团期</span>
          <select v-model="noticeSessionId" required>
            <option value="">请选择团期</option>
            <option v-for="session in tourSessions" :key="session.id" :value="session.id">
              {{ session.code }} · {{ catalogTitleById(session.catalogItemId) }}
            </option>
          </select>
        </label>
        <label>
          <span>版本号</span>
          <input v-model="noticeVersion" required maxlength="64" placeholder="v1" />
        </label>
        <label>
          <span>标题</span>
          <input v-model="noticeTitle" required maxlength="255" />
        </label>
        <button type="submit" :disabled="submitting">创建演示告知书</button>
      </form>
    </template>
    <ul class="record-list record-list--columns">
      <li v-for="session in tourSessions" :key="session.id">
        <strong>{{ catalogTitleById(session.catalogItemId) }}</strong>
        <span>{{ formatFen(session.priceFen) }}</span>
        <span>{{ session.capacity }} 人</span>
        <span>{{ formatRange(session.startsAt, session.endsAt) }}</span>
        <span>{{ formatRange(session.enrollmentOpensAt, session.enrollmentClosesAt) }}</span>
        <span>{{ statusText(session.status) }}</span>
        <span class="notice-summary">
          告知书：{{ session.activeNotice ? `${session.activeNotice.title}（${session.activeNotice.version}）` : '未配置' }}
        </span>
        <span class="notice-summary notice-summary--wide">
          <template v-for="notice in noticeVersionsBySession(session.id)" :key="notice.id">
            <button type="button" class="record-action" :disabled="submitting || session.activeNoticeId === notice.id" @click="emit('activateNotice', { tourSessionId: session.id, noticeVersionId: notice.id })">
              {{ session.activeNoticeId === notice.id ? '当前激活' : `激活 ${notice.version}` }}
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
import { ref } from "vue"
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
const noticeTitle = ref("[演示]大明山地质研学告知书 v1")

const demoNoticeContent: NoticeContent = {
  destination: "[演示]大明山地质研学",
  departurePlace: "[演示]临安旅游集散中心门口",
  mealNote: "[演示]含午餐，特殊餐食由家长提前备注",
  itinerary: [
    "[演示]1. 集合签到与安全提醒",
    "[演示]2. 乘车前往大明山",
    "[演示]3. 地质地貌观察",
    "[演示]4. 午餐与休整",
    "[演示]5. 研学任务记录",
    "[演示]6. 分享总结",
    "[演示]7. 返程交接",
  ],
  unitPrices: ["[演示]学生195元/人", "[演示]成人195元/人"],
  packageExamples: ["[演示]1名学生195元", "[演示]1名成人195元", "[演示]1名学生+1名成人390元"],
  reminders: ["[演示]请携带身份证件", "[演示]本内容仅用于开发演示，非实时活动安排"],
}

function createNotice(): void {
  emit("createNotice", {
    tourSessionId: noticeSessionId.value,
    payload: {
      version: noticeVersion.value,
      title: noticeTitle.value,
      contentJson: demoNoticeContent,
    },
  })
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
