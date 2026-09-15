# 微信小程序

uni-app、Vue 3 和 TypeScript 的微信小程序骨架。当前只提供启动健康页，正式名称、AppID、服务域名和支付参数等待后续环境配置接入。

## Scripts

- `pnpm dev:mp-weixin`：生成微信小程序开发版到 `dist/dev/mp-weixin`
- `pnpm build:mp-weixin`：生成微信小程序生产版到 `dist/build/mp-weixin`
- `pnpm typecheck`：运行 Vue/TypeScript 类型检查
- `pnpm test`：运行最小单元测试
- `pnpm test:e2e`：先生成当前生产构建，再通过 `miniprogram-automator` 启动微信开发者工具；缺少 `WECHAT_DEVTOOLS_CLI` 时会明确失败
