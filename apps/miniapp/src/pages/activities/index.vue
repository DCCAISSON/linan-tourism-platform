<script setup lang="ts">
import { computed, ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import ActivityCard from "../../components/ActivityCard.vue"
import DiscoveryState from "../../components/DiscoveryState.vue"
import { useActivityCatalog } from "./useActivityCatalog"
import { readPickerIndex } from "../index/page-helpers"
import type { PickerChangeEvent } from "../index/useEnrollmentPage"
const { state, error, schools, trips, load } = useActivityCatalog()
const schoolId = ref("")
const schoolNames = computed(() => ["全部学校", ...schools.value.map((school) => school.name)])
const filtered = computed(() => trips.value.filter((trip) => schoolId.value === "" || trip.session.organizationId === schoolId.value))
const schoolName = computed(() => schools.value.find((school) => school.id === schoolId.value)?.name ?? "全部学校")
function selectSchool(event: PickerChangeEvent): void { schoolId.value = schools.value[readPickerIndex(event) - 1]?.id ?? "" }
onShow(() => { void load() })
</script>

<template>
  <view class="discovery-page">
    <text class="page-heading">研学活动</text>
    <text class="page-subtitle">选择学校，查看适用团期和学校价格。</text>
    <picker class="activity-school-picker" mode="selector" :range="schoolNames" @change="selectSchool"><view class="filter-picker">学校：{{ schoolName }}</view></picker>
    <DiscoveryState :state="state" :message="error" empty-title="暂无已发布活动" @retry="load" />
    <view v-if="state === 'ready'">
      <text v-if="filtered.length === 0" class="test-notice">该学校暂无已发布团期，请选择其他学校。</text>
      <ActivityCard v-for="trip in filtered" :key="trip.session.id" :trip="trip" />
    </view>
  </view>
</template>

<style>
@import "../../styles/discovery.css";
</style>
