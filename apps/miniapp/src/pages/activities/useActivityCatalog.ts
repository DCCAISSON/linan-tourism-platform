import { computed, ref } from "vue"
import { createMiniappApi, type CatalogItem, type School, type TourSession } from "../../api"
import { activityTrips } from "../../activity-catalog"
import type { LoadState } from "../../enrollment-flow"
import { readableError } from "../index/page-helpers"

export function useActivityCatalog() {
  const api = createMiniappApi()
  const state = ref<LoadState>("loading")
  const error = ref("")
  const activities = ref<readonly CatalogItem[]>([])
  const sessions = ref<readonly TourSession[]>([])
  const schools = ref<readonly School[]>([])
  const trips = computed(() => activityTrips(activities.value, sessions.value, schools.value))

  async function load(): Promise<void> {
    state.value = "loading"
    error.value = ""
    try {
      const result = await Promise.all([api.listCatalogItems(), api.listTourSessions(), api.listSchools()])
      activities.value = result[0]
      sessions.value = result[1]
      schools.value = result[2]
      state.value = trips.value.length > 0 ? "ready" : "empty"
    } catch (cause) {
      state.value = "error"
      error.value = readableError(cause, "活动加载失败，请重试")
    }
  }

  return { state, error, schools, trips, load }
}
