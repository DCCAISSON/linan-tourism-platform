import type { InjectionKey, Ref } from "vue"

export type PendingSessionNavigation = {
  readonly path: string
  readonly tourSessionId: string | undefined
  readonly token: symbol
}

export const pendingSessionNavigationKey: InjectionKey<Ref<PendingSessionNavigation | undefined>> = Symbol("pendingSessionNavigation")
