# 微信小程序

uni-app、Vue 3 和 TypeScript 微信小程序。首页、研学活动、我的订单、我的四个入口读取现有接口数据。活动详情展示课程介绍、团期和对应学校价格；报名入口保留所选学校和团期，支持选择常用参加人或添加学生、成人。订单详情展示报名时的人员和金额记录。

生产构建已接入正式小程序 AppID、服务域名和微信支付APIv3。支付和对账能力由服务端支付配置统一控制，退款另有独立服务端开关；小程序支付入口读取服务端实时能力。1元真机支付、全额退款、本地回调和实际到账已经通过，支付取消、部分退款、异常退款及正式账单对账仍需补齐。开发版上传不等于体验版、提审或上线。

## Scripts

- `pnpm dev:mp-weixin`：生成微信小程序开发版到 `dist/dev/mp-weixin`
- `pnpm build:mp-weixin`：生成微信小程序生产版到 `dist/build/mp-weixin`
- `pnpm typecheck`：运行 Vue/TypeScript 类型检查
- `pnpm test`：运行报名、支付和家庭中心 API 边界测试
- `pnpm test:e2e`：先生成当前生产构建，再通过 `miniprogram-automator` 启动微信开发者工具；缺少 `WECHAT_DEVTOOLS_CLI` 时会明确失败

未配置 `VITE_API_BASE_URL` 时默认连接 `https://api.linantravel.cn`。本地联调需用 `VITE_API_BASE_URL` 显式指定本地 API，`VITE_DEV_FAMILY_IDENTITY_HEADER` 指定演示家庭身份。自动化测试使用独立 HTTP 测试服务，不连接正式支付；截图保存到 `.omo/evidence/linan-first-working-20260917/miniapp/devtools`，保留此前验收图片。
