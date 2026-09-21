<template>
  <section class="configuration-page" aria-labelledby="configuration-title">
    <header class="configuration-heading">
      <div>
        <p class="configuration-heading__eyebrow">基础配置</p>
        <h2 id="configuration-title">学校、课程与团期配置</h2>
      </div>
      <p>维护学校、年级、班级与活动安排，按团期设置学校价格和报名时间。</p>
    </header>

    <div class="configuration-grid">
      <SchoolPanel
        :error="schoolError"
        :form-error="schoolFormError"
        :loading="schoolLoading"
        :schools="schools"
        :submitting="schoolSubmitting"
        @create="submitSchool"
        @delete="removeSchool"
      />
      <GradePanel
        :error="gradeError"
        :form-error="gradeFormError"
        :grades="grades"
        :loading="gradeLoading"
        :schools="schools"
        :selected-school-id="selectedSchoolId"
        :submitting="gradeSubmitting"
        @create="submitGrade"
        @delete="removeGrade"
        @select-school="selectSchool"
      />
      <ClassPanel
        :classes="classes"
        :error="classError"
        :form-error="classFormError"
        :grades="grades"
        :loading="classLoading"
        :selected-grade-id="selectedGradeId"
        :submitting="classSubmitting"
        @create="submitClass"
        @delete="removeClass"
        @select-grade="selectGrade"
      />
      <CatalogPanel
        :catalog-items="catalogItems"
        :error="catalogError"
        :form-error="catalogFormError"
        :loading="catalogLoading"
        :schools="schools"
        :submitting="catalogSubmitting"
        @create="submitCatalogItem"
        @update="updateCatalog"
        @delete="removeCatalogItem"
      />
      <SessionPanel
        :catalog-items="catalogItems"
        :error="sessionError"
        :form-error="sessionFormError"
        :loading="sessionLoading"
        :schools="schools"
        :submitting="sessionSubmitting"
        :notice-versions="noticeVersions"
        :tour-sessions="tourSessions"
        @create="submitTourSession"
        @delete="removeTourSession"
        @update="updateSession"
        @create-notice="createNotice"
        @activate-notice="activateNotice"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from "vue"

import "@/styles/configuration.css"
import ClassPanel from "@/views/configuration/ClassPanel.vue"
import CatalogPanel from "@/views/configuration/CatalogPanel.vue"
import GradePanel from "@/views/configuration/GradePanel.vue"
import SchoolPanel from "@/views/configuration/SchoolPanel.vue"
import SessionPanel from "@/views/configuration/SessionPanel.vue"
import { useCatalogSessions } from "@/views/configuration/useCatalogSessions"
import { useSchoolStructure } from "@/views/configuration/useSchoolStructure"

const {
  classError,
  classFormError,
  classLoading,
  classSubmitting,
  classes,
  gradeError,
  gradeFormError,
  gradeLoading,
  gradeSubmitting,
  grades,
  loadSchoolList,
  removeClass,
  removeGrade,
  removeSchool,
  schoolError,
  schoolFormError,
  schoolLoading,
  schoolSubmitting,
  schools,
  selectGrade,
  selectSchool,
  selectedGradeId,
  selectedSchoolId,
  submitClass,
  submitGrade,
  submitSchool,
} = useSchoolStructure()

const {
  catalogError,
  catalogFormError,
  catalogItems,
  catalogLoading,
  catalogSubmitting,
  loadCatalogList,
  loadSessionList,
  removeCatalogItem,
  removeTourSession,
  noticeVersions,
  createNotice,
  activateNotice,
  sessionError,
  sessionFormError,
  sessionLoading,
  sessionSubmitting,
  submitCatalogItem,
  submitTourSession,
  tourSessions,
  updateSession,
  updateCatalog,
} = useCatalogSessions()

onMounted(() => {
  void Promise.all([loadSchoolList(), loadCatalogList(), loadSessionList()])
})
</script>
