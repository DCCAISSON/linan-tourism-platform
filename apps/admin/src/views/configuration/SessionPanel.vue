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
            <label for="notice-prices">单价说明（每行一条）</label>
            <textarea id="notice-prices" v-model="noticeUnitPricesText" required rows="4" placeholder="学生128元/人" />
          </div>
          <div class="field">
            <label for="notice-packages">组合示例（每行一条）</label>
            <textarea id="notice-packages" v-model="noticePackageExamplesText" required rows="4" placeholder="1名学生128元" />
          </div>
          <div class="field">
            <label for="notice-reminders">温馨提醒（每行一条）</label>
            <textarea id="notice-reminders" v-model="noticeRemindersText" required rows="4" placeholder="请按工作人员通知时间集合" />
          </div>
          <p v-if="formError" class="form-error">{{ formError }}</p>
          <button type="submit" :disabled="submitting || tourSessions.length === 0">创建告知书</button>
        </fieldset>
      </form>
    </template>
    <ul class="record-list record-list--columns">
      <li v-for="session in tourSessions" :key="session.id">
        <strong>{{ catalogTitleById(session.catalogItemId) }}</strong>
        <span>{{ formatFen(session.priceFen) }}</span>
        <span>{{ session.capacity }} 人</span>
        <span v-if="session.minimumParticipants != null" class="notice-summary notice-summary--wide">
          最低人数参考：已付款有效人数 {{ session.occupiedCapacity ?? '暂未提供' }} / 最低人数 {{ session.minimumParticipants }}
          <template v-if="session.occupiedCapacity != null"> · {{ session.occupiedCapacity >= session.minimumParticipants ? '已达参考人数' : '未达参考人数' }}</template>
        </span>
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
const noticeTitle = ref("")
const noticeDestination = ref("")
const noticeDeparturePlace = ref("")
const noticeMealNote = ref("")
const noticeItinerary = ref(["", "", "", "", "", "", ""])
const noticeUnitPricesText = ref("")
const noticePackageExamplesText = ref("")
const noticeRemindersText = ref("")

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
