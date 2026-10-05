<script setup lang="ts">
import { ref, watchEffect } from "vue"
import type { FamilyMember } from "../../enrollment-flow"
import { memberFieldAnchor, readMemberFieldError } from "../../enrollment-validation"
import type { useEnrollmentPage } from "./useEnrollmentPage"

const props = defineProps<{
  readonly page: ReturnType<typeof useEnrollmentPage>
}>()

const {
  addMember,
  draft,
  memberFieldError,
  memberPlacement,
  memberPlacementFailed,
  retryMemberPlacements,
  memberToEdit,
  removeMember,
  toggleMember,
  updateSavedMemberName,
} = props.page

const editingMemberId = ref<string | null>(null)
const editingDisplayName = ref("")
const editingError = ref("")
const savingMemberId = ref<string | null>(null)
const memberExpanded = ref<Record<string, boolean>>({})

watchEffect(() => {
  for (const member of draft.familyMembers) {
    if ((["displayName", "identityNumber", "phone"] as const).some((field) =>
      memberFieldError(member, field).length > 0)) {
      expandMember(member)
    }
    if (memberToEdit.value === member.id) {
      expandMember(member)
      memberToEdit.value = null
    }
  }
})

function isMemberCollapsed(member: FamilyMember): boolean {
  return !(memberExpanded.value[member.id] ?? !member.fromCommonList)
}

function expandMember(member: FamilyMember): void {
  memberExpanded.value[member.id] = true
}

function canCollapse(member: FamilyMember): boolean {
  return (["displayName", "identityNumber", "phone"] as const)
    .every((field) => readMemberFieldError({ ...member, selected: true }, field) === undefined)
}

function collapseMember(member: FamilyMember): void {
  if (canCollapse(member) && editingMemberId.value !== member.id) memberExpanded.value[member.id] = false
}

function memberProfileStatus(member: FamilyMember): string {
  const pending: string[] = []
  const selected = { ...member, selected: true }
  if (readMemberFieldError(selected, "displayName")) pending.push("姓名")
  if (!member.identityNumber?.trim() || readMemberFieldError(selected, "identityNumber")) pending.push("证件")
  if (readMemberFieldError(selected, "phone")) pending.push("手机")
  return pending.length > 0 ? `${pending.join("、")}待完善` : "姓名、证件已填写"
}

function memberHealthStatus(member: FamilyMember): string {
  if (!member.healthNotes?.trim()) return "未填写（选填）"
  return member.healthConsent ? "已填写，已单独授权本次保存" : "已填写，未授权提交"
}

function maskedIdentity(member: FamilyMember): string {
  const value = member.identityNumber?.trim() ?? ""
  if (value.includes("*")) return value
  return value.length > 8 ? `${value.slice(0, 6)}********${value.slice(-4)}` : "待完善"
}

function updateHealthNotes(member: FamilyMember, event: unknown): void {
  if (typeof event !== "object" || event === null || !("detail" in event)) return
  const detail = event.detail
  if (typeof detail === "object" && detail !== null && "value" in detail && typeof detail.value === "string") {
    member.healthNotes = detail.value
  }
}

function startEditing(member: FamilyMember): void {
  editingMemberId.value = member.id
  editingDisplayName.value = member.displayName
  editingError.value = ""
}

function cancelEditing(): void {
  editingMemberId.value = null
  editingDisplayName.value = ""
  editingError.value = ""
}

async function saveMemberName(member: FamilyMember): Promise<void> {
  const remoteMemberId = member.remoteMemberId
  if (remoteMemberId === undefined || savingMemberId.value !== null) return
  const nextName = editingDisplayName.value.trim()
  const nameError = readMemberFieldError({ ...member, displayName: nextName, selected: true }, "displayName")
  if (nameError !== undefined) {
    editingError.value = nameError
    return
  }
  savingMemberId.value = member.id
  editingError.value = ""
  try {
    await updateSavedMemberName(remoteMemberId, nextName)
    cancelEditing()
  } catch {
    editingError.value = "保存失败，请稍后重试。"
  } finally {
    savingMemberId.value = null
  }
}
</script>

<template>
  <view id="enrollment-members-field" class="section member-section">
    <view class="section__header section__header--members">
      <view>
        <text class="section__title">参加人员</text>
        <text class="section__hint">勾选本次参加人员，需要更正或补充时再编辑。</text>
      </view>
    </view>


    <button class="member-manage-button" @tap="addMember">＋ 添加学生或成人</button>
    <text class="required-note"><text class="required-mark">*</text>至少选择一名参加人员；学生联系电话统一使用下方家长手机。</text>
    <button v-if="memberPlacementFailed" class="member-edit-button" @tap="retryMemberPlacements">重试班级信息</button>

    <view v-if="draft.familyMembers.length === 0" class="empty-line">
      <text>尚未添加参加人员，请先添加学生或成人。</text>
    </view>

    <view
      v-for="member in draft.familyMembers"
      :key="member.id"
      class="member-row member-card"
      :class="{ 'member-card--selected': member.selected }"
    >
      <view v-if="isMemberCollapsed(member)" class="member-card__overview">
        <view :id="memberFieldAnchor(member.id, 'displayName')" class="member-row__fields">
          <view class="member-card__name-line">
            <text class="member-card__name">{{ member.displayName }}</text>
            <text class="member-card__tag">{{ member.participantKind === 'adult' ? '成人' : '学生' }}</text>
          </view>
          <text class="member-card__identity">{{ memberPlacement(member) }}</text>
          <text class="member-card__identity">资料：{{ memberProfileStatus(member) }}</text>
          <text class="member-card__identity">本次健康补充：{{ memberHealthStatus(member) }}</text>
          <button class="member-edit-button" @tap="expandMember(member)">编辑参加人</button>
        </view>
        <button v-if="member.fromCommonList" class="member-choice" :class="{ 'member-choice--selected': member.selected }" @tap="toggleMember(member.id)">
          <text class="member-choice__check">{{ member.selected ? '✓' : '' }}</text>
          <text class="member-choice__label">{{ member.selected ? '已选' : '选择' }}</text>
        </button>
        <text v-else class="member-card__tag">已选</text>
      </view>
      <template v-else>
      <view v-if="member.remoteMemberId !== undefined" class="member-card__overview">
        <view :id="memberFieldAnchor(member.id, 'displayName')" class="member-row__fields">
          <text v-if="memberFieldError(member, 'displayName')" class="field-error">{{ memberFieldError(member, 'displayName') }}</text>
          <view v-if="editingMemberId !== member.id">
            <view class="member-card__name-line">
              <text class="member-card__name">{{ member.displayName }}</text>
              <text class="member-card__tag">{{ member.participantKind === "adult" ? "成人" : "学生" }}</text>
              <text v-if="member.fromCommonList" class="member-card__tag member-card__tag--soft">常用参加人</text>
            </view>
            <text class="member-card__identity">证件：{{ maskedIdentity(member) }}</text>
            <text class="member-card__identity">{{ memberPlacement(member) }}</text>
            <button class="member-edit-button" @tap="startEditing(member)">编辑姓名</button>
          </view>
          <view v-else class="member-name-editor">
            <view class="input-label"><text class="required-mark">*</text>参加人姓名</view>
            <input v-model="editingDisplayName" class="text-input" maxlength="120" placeholder="请输入中文或英文姓名" placeholder-class="input-placeholder" />
            <text v-if="editingError.length > 0" class="field-error">{{ editingError }}</text>
            <view class="member-editor-actions">
              <button class="member-editor-button member-editor-button--secondary" :disabled="savingMemberId === member.id" @tap="cancelEditing">取消</button>
              <button class="member-editor-button member-editor-button--primary" :loading="savingMemberId === member.id" @tap="saveMemberName(member)">保存</button>
            </view>
          </view>
        </view>
        <button
          v-if="member.fromCommonList"
          class="member-choice"
          :class="{ 'member-choice--selected': member.selected }"
          @tap="toggleMember(member.id)"
        >
          <text class="member-choice__check">{{ member.selected ? "✓" : "" }}</text>
          <text class="member-choice__label">{{ member.selected ? "已选" : "选择" }}</text>
        </button>
        <view v-else class="member-choice member-choice--selected member-choice--static">
          <text class="member-choice__check">✓</text>
          <text class="member-choice__label">已选</text>
        </view>
      </view>

      <view v-else class="member-row__fields">
        <view class="member-card__editor-header">
          <view>
            <text class="member-card__name">新增参加人</text>
            <text class="section__hint">填写后自动加入本次报名</text>
          </view>
          <view class="member-choice member-choice--selected member-choice--static">
            <text class="member-choice__check">✓</text>
            <text class="member-choice__label">已选</text>
          </view>
        </view>
        <view class="kind-toggle">
          <button class="kind-toggle__button" :class="{ 'kind-toggle__button--on': (member.participantKind ?? 'student') === 'student' }" @tap="member.participantKind = 'student'">学生</button>
          <button class="kind-toggle__button" :class="{ 'kind-toggle__button--on': member.participantKind === 'adult' }" @tap="member.participantKind = 'adult'">成人</button>
        </view>
        <view :id="memberFieldAnchor(member.id, 'displayName')" class="field-anchor">
          <view class="input-label"><text class="required-mark">*</text>姓名</view>
          <input v-model="member.displayName" class="text-input" maxlength="120" placeholder="请输入中文或英文姓名" placeholder-class="input-placeholder" />
          <text v-if="memberFieldError(member, 'displayName').length > 0" class="field-error">{{ memberFieldError(member, 'displayName') }}</text>
        </view>
        <view :id="memberFieldAnchor(member.id, 'identityNumber')" class="field-anchor">
          <view class="input-label"><text class="required-mark">*</text>证件号码</view>
          <input v-model="member.identityNumber" class="text-input" maxlength="18" placeholder="请输入身份证号码" placeholder-class="input-placeholder" />
          <text v-if="memberFieldError(member, 'identityNumber').length > 0" class="field-error">{{ memberFieldError(member, 'identityNumber') }}</text>
        </view>
        <view v-if="member.participantKind === 'adult'" :id="memberFieldAnchor(member.id, 'phone')" class="field-anchor">
          <view class="input-label">本人手机（选填，与家长不同时填写）</view>
          <input v-model="member.phone" class="text-input" maxlength="11" type="number" placeholder="请输入11位手机号码" placeholder-class="input-placeholder" />
          <text v-if="memberFieldError(member, 'phone').length > 0" class="field-error">{{ memberFieldError(member, 'phone') }}</text>
        </view>
        <text v-if="member.participantKind === 'adult'" class="member-row__hint">成人参加人无需选择年级和班级</text>
        <checkbox-group @change="member.saveAsCommon = $event.detail.value.includes('save-common')">
          <label class="consent-button save-common-button" :class="{ 'consent-button--on': member.saveAsCommon }">
            <checkbox class="choice-control" value="save-common" :checked="member.saveAsCommon" color="var(--accent-primary)" />
            <text>保存为常用参加人，方便下次报名</text>
          </label>
        </checkbox-group>
        <button class="member-delete-button" @tap="removeMember(member.id)">删除本次参加人</button>
      </view>

      <view v-if="member.selected" class="member-health" :data-member-id="member.id">
        <text class="health-label">健康补充（选填）</text>
        <text class="health-hint">如有过敏、身体不适或需特别照顾的事项，可在这里说明；不填写也可报名。</text>
        <textarea :value="member.healthNotes ?? ''" class="health-notes-input" :maxlength="2000" placeholder="请填写本次出行需留意的事项" placeholder-class="input-placeholder" @input="updateHealthNotes(member, $event)" />
        <text class="health-count">{{ member.healthNotes?.length ?? 0 }}/2000</text>
        <checkbox-group @change="member.healthConsent = $event.detail.value.includes('health-consent')">
          <label class="consent-button health-consent-choice" :class="{ 'consent-button--on': member.healthConsent }">
            <checkbox class="choice-control" value="health-consent" :checked="member.healthConsent === true" color="var(--accent-primary)" />
            <text>同意保存健康备注，仅供本次活动有健康信息权限的工作人员查看。</text>
          </label>
        </checkbox-group>
        <text class="health-hint">可在订单的“健康信息与授权”中撤回。不勾选时，备注不会随报名提交。</text>
      </view>
      <button class="member-edit-button" :disabled="!canCollapse(member) || editingMemberId === member.id" @tap="collapseMember(member)">完成并收起</button>
      </template>
    </view>
  </view>
</template>

<style scoped>
.section { box-sizing: border-box; margin-top: 24px; padding: 20px; border-radius: 8px; background: var(--surface-elevated); }
.section__header, .member-row, .member-card__overview, .member-card__editor-header, .member-card__name-line, .member-editor-actions { display: flex; align-items: center; }
.section__header { justify-content: space-between; gap: 12px; min-width: 0; }
.section__header--members { align-items: flex-start; }
.section__title { display: block; color: var(--text-primary); font-size: 18px; font-weight: 600; line-height: 1.4; }
.section__hint { display: block; color: var(--text-secondary); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.required-mark { color: var(--status-error); }
.required-note { display: block; margin-top: 8px; color: var(--text-tertiary); font-size: 12px; line-height: 1.4; }
.member-manage-button { box-sizing: border-box; width: 100%; min-height: 48px; margin: var(--space-3) 0 0; border: 1px solid var(--brand-primary); border-radius: var(--radius-control); color: var(--accent-primary); background: var(--surface-elevated); font-size: var(--font-body); font-weight: 600; line-height: 48px; }
.member-row { gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.member-card { box-sizing: border-box; width: 100%; padding: var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-card); background: var(--surface-primary); }
.member-card--selected { border-color: var(--brand-primary); box-shadow: inset 4px 0 0 var(--brand-primary); background: var(--surface-elevated); }
.member-card__overview, .member-card__editor-header { width: 100%; justify-content: space-between; gap: var(--space-3); }
.member-card__name-line { flex-wrap: wrap; gap: var(--space-2); }
.member-card__name { color: var(--text-primary); font-size: var(--font-h3); font-weight: 700; line-height: 1.4; }
.member-card__tag { padding: 2px var(--space-2); border: 1px solid var(--brand-primary); border-radius: 999px; color: var(--accent-primary); background: var(--accent-soft); font-size: var(--font-caption); line-height: 1.5; }
.member-card__tag--soft { border-color: var(--border-default); color: var(--text-secondary); background: var(--surface-secondary); }
.member-card__identity { display: block; margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; overflow-wrap: anywhere; }
.member-row__fields { flex: 1 1 auto; min-width: 0; }
.member-choice { display: flex; flex: 0 0 60px; flex-direction: column; align-items: center; gap: var(--space-1); min-width: 60px; min-height: 56px; margin: 0; padding: var(--space-1); color: var(--text-tertiary); background: transparent; font-size: var(--font-caption); line-height: 1.2; }
.member-choice::after, .member-edit-button::after, .member-delete-button::after, .member-editor-button::after { border: 0; }
.member-choice__check { box-sizing: border-box; width: 28px; height: 28px; border: 2px solid var(--border-default); border-radius: 50%; color: var(--surface-elevated); font-size: 18px; font-weight: 700; line-height: 24px; text-align: center; background: var(--surface-elevated); }
.member-choice--selected { color: var(--accent-primary); }
.member-choice--selected .member-choice__check { border-color: var(--brand-primary); background: var(--brand-primary); }
.member-choice--static { justify-content: flex-start; }
.member-edit-button, .member-delete-button { min-height: 44px; margin: var(--space-2) 0 0; padding: 0; background: transparent; font-size: var(--font-body-sm); line-height: 44px; text-align: left; }
.member-edit-button { color: var(--accent-primary); }
.member-delete-button { color: var(--status-error); }
.member-name-editor { min-width: 0; }
.member-editor-actions { justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2); }
.member-editor-button { min-width: 72px; min-height: 44px; margin: 0; border-radius: var(--radius-control); font-size: var(--font-body-sm); line-height: 44px; }
.member-editor-button--secondary { border: 1px solid var(--border-default); color: var(--text-secondary); background: var(--surface-elevated); }
.member-editor-button--primary { color: var(--surface-elevated); background: var(--accent-primary); }
.kind-toggle { display: flex; gap: 8px; margin-bottom: 8px; }
.kind-toggle__button { min-height: 44px; margin: 0; border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-secondary); background: var(--surface-primary); font-size: 14px; line-height: 44px; }
.kind-toggle__button--on { color: var(--accent-primary); border-color: var(--accent-primary); background: var(--accent-soft); }
.input-label { display: block; margin: 10px 0 4px; color: var(--text-secondary); font-size: 12px; line-height: 1.4; }
.text-input { display: block; box-sizing: border-box; width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-primary); background: var(--surface-primary); font-size: 16px; line-height: 44px; }
.field-error { display: block; margin-top: 4px; color: var(--status-error); font-size: 12px; line-height: 1.4; }
.member-row__hint { display: block; margin-top: 8px; color: var(--text-tertiary); font-size: 12px; line-height: 1.4; }
.consent-button { display: flex; box-sizing: border-box; align-items: flex-start; gap: var(--space-2); width: 100%; min-height: 44px; margin-top: var(--space-3); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-secondary); background: var(--surface-primary); font-size: 16px; line-height: 1.6; text-align: left; }
.consent-button--on { color: var(--accent-primary); border-color: var(--accent-primary); background: var(--accent-soft); }
.choice-control { flex: 0 0 auto; }
.consent-button > text { min-width: 0; overflow-wrap: anywhere; }
.member-health { flex: 1 0 100%; box-sizing: border-box; min-width: 0; margin-top: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--border-subtle); }
.health-label { display: block; color: var(--text-primary); font-size: var(--font-body); font-weight: 600; }
.health-hint { display: block; margin-top: var(--space-2); color: var(--text-secondary); font-size: var(--font-body-sm); line-height: 1.5; }
.health-notes-input { box-sizing: border-box; width: 100%; height: calc(var(--space-10) * 2); margin-top: var(--space-3); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-primary); font-size: var(--font-body); line-height: 1.5; }
.health-count { display: block; margin-top: var(--space-1); text-align: right; color: var(--text-tertiary); font-size: var(--font-caption); }
.health-consent-choice { font-size: var(--font-body-sm); }
.empty-line { display: block; margin-top: 8px; color: var(--text-secondary); font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; }
</style>
