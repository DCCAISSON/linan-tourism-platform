import { inject, onBeforeUnmount, ref, watch, type Ref } from "vue"
import { onBeforeRouteUpdate, useRoute, useRouter } from "vue-router"
import { pendingSessionNavigationKey, type PendingSessionNavigation } from "./session-navigation"

export function useSessionQuery(selection: Ref<string>, permits: (id: string) => boolean, locked: () => boolean) {
  const route = useRoute()
  const router = useRouter()
  const pagePath = route.path
  const pending = inject(pendingSessionNavigationKey, ref<PendingSessionNavigation>())
  const revision = ref(0)
  let ready = false
  let queryUpdates = 0
  let navigationToken: symbol | undefined
  onBeforeRouteUpdate(to => !locked() || (to.query["tourSessionId"] ?? "") === selection.value)

  function read(): void {
    if (!ready || route.path !== pagePath || queryUpdates > 0) return
    const id = route.query["tourSessionId"]
    selection.value = typeof id === "string" && permits(id) ? id : ""
    void write()
  }
  async function write(): Promise<void> {
    if (!ready || route.path !== pagePath) return
    const current = permits(selection.value) ? selection.value : undefined
    if (route.query["tourSessionId"] === current && pending.value?.path !== pagePath) return
    const query = { ...route.query }
    if (current === undefined) delete query["tourSessionId"]
    else query["tourSessionId"] = current
    const token = Symbol()
    navigationToken = token
    pending.value = { path: pagePath, tourSessionId: current, token }
    queryUpdates += 1
    try { await router.replace({ query }) }
    finally {
      queryUpdates -= 1
      if (pending.value?.token === token) pending.value = undefined
    }
  }
  watch(selection, () => { revision.value += 1; void write() }, { flush: "sync" })
  watch(() => route.query["tourSessionId"], read)
  onBeforeUnmount(() => {
    revision.value += 1
    if (pending.value?.token === navigationToken) pending.value = undefined
  })
  return { revision, initialize: () => { ready = true; read() } }
}
