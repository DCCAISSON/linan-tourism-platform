<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app"
import { getWechatSessionToken } from "./wechat-token"

onLaunch(() => {
  if (import.meta.env["VITE_WECHAT_LOGIN_ENABLED"] !== "true" || getWechatSessionToken() !== undefined) return
  uni.reLaunch({ url: "/pages/login/index" })
})
</script>

<style>
page {
  --surface-primary: #f5f8fc;
  --surface-secondary: #eaf1f8;
  --surface-elevated: #ffffff;
  --text-primary: #16324a;
  --text-secondary: #546b7d;
  --text-tertiary: #566f82;
  --border-default: #ccd9e6;
  --border-subtle: #e2eaf2;
  --accent-primary: #1468c0;
  --accent-hover: #10549b;
  --accent-soft: #e8f2ff;
  --accent-secondary: #13745c;
  --accent-secondary-soft: #e7f5ef;
  --brand-ink: #104b7a;
  --brand-mist: #dff1f6;
  --on-accent: #ffffff;
  --accent-warm: #9c5414;
  --status-success: #13745c;
  --status-warning: #995600;
  --status-error: #b6383e;
  --status-info: #1468c0;
  --font-display: 32px;
  --font-h1: 28px;
  --font-h2: 22px;
  --font-h3: 18px;
  --font-body-lg: 17px;
  --font-body: 16px;
  --font-body-sm: 14px;
  --font-caption: 12px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 40px;
  --space-9: 48px;
  --space-10: 64px;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-banner: 16px;
  --size-touch-target: 44px;
  --layout-content-max: 1440px;
  --layout-sidebar-width: 240px;
  min-height: 100%;
  background: var(--surface-primary);
  color: var(--text-primary);
  font-family: PingFang SC, Microsoft YaHei, system-ui, sans-serif;
}
</style>
