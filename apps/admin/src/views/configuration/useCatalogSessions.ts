import { ref } from "vue"

import {
  type CatalogItem,
  type CatalogItemPayload,
  type CatalogContentPayload,
  type NoticeVersion,
  type NoticeVersionPayload,
  type TourSession,
  type TourSessionPayload,
  type TourSessionUpdatePayload,
  createCatalogItem,
  createNoticeVersion,
  createTourSession,
  deleteCatalogItem,
  deleteTourSession,
  listCatalogItems,
  listNoticeVersions,
  listTourSessions,
  readableApiError,
  updateTourSession,
  updateEnrollmentScope,
  updateCatalogContent,
  activateNoticeVersion,
} from "@/api/configuration"

export function useCatalogSessions() {
  const catalogItems = ref<readonly CatalogItem[]>([])
  const tourSessions = ref<readonly TourSession[]>([])
  const noticeVersions = ref<readonly NoticeVersion[]>([])
  const catalogLoading = ref(false)
  const sessionLoading = ref(false)
  const catalogSubmitting = ref(false)
  const sessionSubmitting = ref(false)
  const catalogError = ref("")
  const sessionError = ref("")
  const catalogFormError = ref("")
  const sessionFormError = ref("")
  const catalogSuccess = ref("")
  const catalogSavedId = ref("")
  const sessionSuccess = ref("")
  const sessionSavedId = ref("")

  async function loadCatalogList(): Promise<void> {
    catalogLoading.value = true
    catalogError.value = ""
    try {
      catalogItems.value = await listCatalogItems()
    } catch (error) {
      catalogError.value = readableApiError(error)
    } finally {
      catalogLoading.value = false
    }
  }

  async function loadSessionList(): Promise<void> {
    sessionLoading.value = true
    sessionError.value = ""
    try {
      tourSessions.value = await listTourSessions()
      noticeVersions.value = (await Promise.all(tourSessions.value.map(session => listNoticeVersions(session.id)))).flat()
    } catch (error) {
      sessionError.value = readableApiError(error)
    } finally {
      sessionLoading.value = false
    }
  }

  async function submitCatalogItem(payload: CatalogItemPayload): Promise<void> {
    catalogSubmitting.value = true
    catalogFormError.value = ""
    catalogSuccess.value = ""
    catalogSavedId.value = ""
    try {
      const created = await createCatalogItem(payload)
      catalogItems.value = [...catalogItems.value, created]
      catalogSavedId.value = created.id
      catalogSuccess.value = `“${created.title}”已保存，请在下方设置团期并核对报名条件。`
    } catch (error) {
      catalogFormError.value = readableApiError(error)
    } finally {
      catalogSubmitting.value = false
    }
  }

  async function submitTourSession(payload: TourSessionPayload): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
    sessionSuccess.value = ""
    sessionSavedId.value = ""
    try {
      const created = await createTourSession(payload)
      tourSessions.value = [...tourSessions.value, created]
      sessionError.value = ""
      sessionSavedId.value = created.id
      sessionSuccess.value = `团期“${created.code}”已保存，请核对该团期的报名条件。`
    } catch (error) {
      sessionFormError.value = readableApiError(error)
    } finally {
      sessionSubmitting.value = false
    }
  }

  async function updateCatalog(change: { readonly id: string; readonly payload: CatalogContentPayload }): Promise<void> {
    catalogSubmitting.value = true
    catalogFormError.value = ""
    catalogSuccess.value = ""
    catalogSavedId.value = ""
    try {
      const updated = await updateCatalogContent(change.id, change.payload)
      catalogItems.value = catalogItems.value.map(item => item.id === updated.id ? updated : item)
      catalogSavedId.value = updated.id
      catalogSuccess.value = `“${updated.title}”内容已保存。小程序重新进入相应页面后显示更新，团期状态不变。`
    } catch (caught) {
      catalogFormError.value = readableApiError(caught)
    } finally {
      catalogSubmitting.value = false
    }
  }

  async function removeCatalogItem(id: string): Promise<void> {
    catalogSubmitting.value = true
    catalogFormError.value = ""
    catalogSuccess.value = ""
    catalogSavedId.value = ""
    try {
      await deleteCatalogItem(id)
      catalogItems.value = catalogItems.value.filter(item => item.id !== id)
    } catch (error) {
      catalogFormError.value = readableApiError(error)
    } finally {
      catalogSubmitting.value = false
    }
  }

  async function createNotice(change: { readonly tourSessionId: string; readonly payload: NoticeVersionPayload }): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
    sessionSuccess.value = ""
    sessionSavedId.value = ""
    try {
      const created = await createNoticeVersion(change.tourSessionId, change.payload)
      noticeVersions.value = [created, ...noticeVersions.value]
      sessionSavedId.value = change.tourSessionId
      sessionSuccess.value = `告知书 ${created.version} 已创建，尚未生效；请在对应团期启用。`
    } catch (error) {
      sessionFormError.value = readableApiError(error)
    } finally {
      sessionSubmitting.value = false
    }
  }

  async function activateNotice(change: { readonly tourSessionId: string; readonly noticeVersionId: string }): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
    sessionSuccess.value = ""
    sessionSavedId.value = ""
    try {
      const updated = await activateNoticeVersion(change.tourSessionId, change.noticeVersionId)
      tourSessions.value = tourSessions.value.map(session => (session.id === updated.id ? updated : session))
      sessionSavedId.value = updated.id
      sessionSuccess.value = "告知书已启用，新报名使用此版本；已有订单保留原版本。"
    } catch (error) {
      sessionFormError.value = readableApiError(error)
    } finally {
      sessionSubmitting.value = false
    }
  }

  async function updateSession(change: { readonly id: string; readonly payload: TourSessionUpdatePayload }): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
    sessionSuccess.value = ""
    sessionSavedId.value = ""
    try {
      const updated = Object.keys(change.payload).length === 1 && change.payload.enrollmentScope !== undefined
        ? await updateEnrollmentScope(change.id, change.payload.enrollmentScope)
        : await updateTourSession(change.id, change.payload)
      tourSessions.value = tourSessions.value.map(session => (session.id === updated.id ? updated : session))
      sessionSavedId.value = updated.id
      sessionSuccess.value = change.payload.status === "published"
        ? "团期已发布，请核对报名时间、告知书和名额；发布不代表当前可报名。"
        : change.payload.status === "closed"
          ? "报名已关闭，课程启用时家长仍可浏览。"
          : "团期修改已保存；小程序重新进入相应页面后显示更新。"
    } catch (error) {
      sessionFormError.value = readableApiError(error)
    } finally {
      sessionSubmitting.value = false
    }
  }

  async function removeTourSession(id: string): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
    sessionSuccess.value = ""
    sessionSavedId.value = ""
    try {
      await deleteTourSession(id)
      tourSessions.value = tourSessions.value.filter(session => session.id !== id)
    } catch (error) {
      sessionFormError.value = readableApiError(error)
    } finally {
      sessionSubmitting.value = false
    }
  }

  return {
    catalogSuccess,
    catalogSavedId,
    sessionSuccess,
    sessionSavedId,
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
  }
}
