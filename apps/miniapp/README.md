# 微信小程序

uni-app、Vue 3 和 TypeScript 微信小程序。首页、研学活动、我的订单、我的四个入口读取现有接口数据。活动详情展示课程介绍、团期和对应学校价格；报名入口保留所选学校和团期，支持选择已有家庭成员或添加演示成员。订单详情展示报名时的人员和金额记录。

当前支付仅用于本地模拟验证，不产生真实扣款。工程已写入正式小程序 AppID；正式微信登录、服务域名和支付参数仍待平台环境接入。开发者工具里的本地调试不等于提审或上线。

## Scripts

- `pnpm dev:mp-weixin`：生成微信小程序开发版到 `dist/dev/mp-weixin`
- `pnpm build:mp-weixin`：生成微信小程序生产版到 `dist/build/mp-weixin`
- `pnpm typecheck`：运行 Vue/TypeScript 类型检查
- `pnpm test`：运行报名、支付和家庭中心 API 边界测试
- `pnpm test:e2e`：先生成当前生产构建，再通过 `miniprogram-automator` 启动微信开发者工具；缺少 `WECHAT_DEVTOOLS_CLI` 时会明确失败

本地联调用 `VITE_API_BASE_URL` 指定 API，`VITE_DEV_FAMILY_IDENTITY_HEADER` 指定演示家庭身份。自动化测试使用独立 HTTP 测试服务，不连接正式支付；截图保存到 `.omo/evidence/linan-first-working-20260917/miniapp/devtools`，保留此前验收图片。
