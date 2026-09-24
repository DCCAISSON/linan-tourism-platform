<script setup lang="ts">
import { ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { createMiniappApi, type SavedEnrollmentMember } from "../../api"
import DiscoveryState from "../../components/DiscoveryState.vue"
import type { LoadState } from "../../enrollment-flow"
import { readableError } from "../index/page-helpers"
type MemberView = SavedEnrollmentMember & { readonly schoolName: string; readonly gradeName: string; readonly className: string }
const api = createMiniappApi()
const members = ref<readonly MemberView[]>([])
const state = ref<LoadState>("loading")
const error = ref("")
onShow(() => { void load() })
async function load(): Promise<void> {
  state.value = "loading"; error.value = ""
  try {
    const [saved, schools] = await Promise.all([api.listEnrollmentMembers(), api.listSchools()])
    members.value = await Promise.all(saved.map(async (member) => {
      if (member.participantKind === "adult" || member.schoolId === null) {
        return { ...member, schoolName: "成人参与人", gradeName: "无需年级", className: "无需班级" }
      }
      const grades = await api.listGrades(member.schoolId)
      const classes = member.gradeId === null ? [] : await api.listClasses(member.gradeId)
      return { ...member, schoolName: schools.find((school) => school.id === member.schoolId)?.name ?? "学校信息待完善", gradeName: grades.find((grade) => grade.id === member.gradeId)?.name ?? "年级未设置", className: classes.find((item) => item.id === member.classId)?.name ?? "班级未设置" }
    }))
    state.value = members.value.length > 0 ? "ready" : "empty"
  } catch (cause) { state.value = "error"; error.value = readableError(cause, "家庭成员加载失败，请重试") }
}
function activities(): void { uni.switchTab({ url: "/pages/activities/index" }) }
function orders(): void { uni.switchTab({ url: "/pages/orders/index" }) }
</script>

<template>
  <view class="discovery-page">
    <text class="page-heading">我的家庭</text><text class="page-subtitle">查看本家庭成员和报名记录。</text>
    <view class="info-card family-shortcuts"><button class="button-secondary family-orders-entry" @tap="orders">我的订单</button><button class="button-primary family-activities-entry" @tap="activities">选择活动报名</button></view>
    <text class="section-heading">家庭成员</text>
    <DiscoveryState :state="state" :message="error" empty-title="本家庭暂无成员" @retry="load" />
    <view v-if="state === 'ready'"><view v-for="member in members" :key="member.id" class="info-card family-member-card"><text class="card-title">{{ member.displayName }}</text><text class="body-secondary">成员编号：{{ member.code }}</text><text class="detail-line">{{ member.schoolName }} · {{ member.gradeName }} · {{ member.className }}</text></view></view>
    <text class="test-notice">报名页可以选择已有成员，也可添加家庭成员。当前为开发体验版，请使用虚构测试资料。</text>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
.family-shortcuts { display: flex; gap: var(--space-3); }
.family-shortcuts button { flex: 1; min-width: 0; font-size: var(--font-body-sm); }
</style>
