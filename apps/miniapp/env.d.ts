declare module "*.vue" {
  import type { DefineComponent } from "vue"

  const component: DefineComponent
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_FAMILY_IDENTITY_HEADER?: string
  readonly VITE_WECHAT_LOGIN_ENABLED?: string
  readonly VITE_WECHAT_PAY_ENABLED?: string
  readonly PROD?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
