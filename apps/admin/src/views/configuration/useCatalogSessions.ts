import { ref } from "vue"

import {
  type CatalogItem,
  type CatalogItemPayload,
  type CatalogContentPayload,
  type TourSession,
  type TourSessionPayload,
  type TourSessionUpdatePayload,
  createCatalogItem,
  createTourSession,
  deleteCatalogItem,
  deleteTourSession,
  listCatalogItems,
  listTourSessions,
  readableApiError,
  updateTourSession,
  updateCatalogContent,
} from "@/api/configuration"

export function useCatalogSessions() {
  const catalogItems = ref<readonly CatalogItem[]>([])
  const tourSessions = ref<readonly TourSession[]>([])
  const catalogLoading = ref(false)
  const sessionLoading = ref(false)
  const catalogSubmitting = ref(false)
  const sessionSubmitting = ref(false)
  const catalogError = ref("")
  const sessionError = ref("")
  const catalogFormError = ref("")
  const sessionFormError = ref("")

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
    } catch (error) {
      sessionError.value = readableApiError(error)
    } finally {
      sessionLoading.value = false
    }
  }

  async function submitCatalogItem(payload: CatalogItemPayload): Promise<void> {
    catalogSubmitting.value = true
    catalogFormError.value = ""
    try {
      catalogItems.value = [...catalogItems.value, await createCatalogItem(payload)]
    } catch (error) {
      catalogFormError.value = readableApiError(error)
    } finally {
      catalogSubmitting.value = false
    }
  }

  async function submitTourSession(payload: TourSessionPayload): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
    try {
      tourSessions.value = [...tourSessions.value, await createTourSession(payload)]
      sessionError.value = ""
    } catch (error) {
      sessionFormError.value = readableApiError(error)
    } finally {
      sessionSubmitting.value = false
    }
  }

  async function updateCatalog(change: { readonly id: string; readonly payload: CatalogContentPayload }): Promise<void> {
    catalogSubmitting.value = true
    catalogFormError.value = ""
    try {
      const updated = await updateCatalogContent(change.id, change.payload)
      catalogItems.value = catalogItems.value.map(item => item.id === updated.id ? updated : item)
    } catch (caught) {
      catalogFormError.value = readableApiError(caught)
    } finally {
      catalogSubmitting.value = false
    }
  }

  async function removeCatalogItem(id: string): Promise<void> {
    catalogSubmitting.value = true
    catalogFormError.value = ""
    try {
      await deleteCatalogItem(id)
      catalogItems.value = catalogItems.value.filter(item => item.id !== id)
    } catch (error) {
      catalogFormError.value = readableApiError(error)
    } finally {
      catalogSubmitting.value = false
    }
  }

  async function updateSession(change: { readonly id: string; readonly payload: TourSessionUpdatePayload }): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
    try {
      const updated = await updateTourSession(change.id, change.payload)
      tourSessions.value = tourSessions.value.map(session => (session.id === updated.id ? updated : session))
    } catch (error) {
      sessionFormError.value = readableApiError(error)
    } finally {
      sessionSubmitting.value = false
    }
  }

  async function removeTourSession(id: string): Promise<void> {
    sessionSubmitting.value = true
    sessionFormError.value = ""
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
    catalogError,
    catalogFormError,
    catalogItems,
    catalogLoading,
    catalogSubmitting,
    loadCatalogList,
    loadSessionList,
    removeCatalogItem,
    removeTourSession,
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
