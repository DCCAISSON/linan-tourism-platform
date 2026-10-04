# PC 管理后台

Vue 3、Vite、TypeScript 和 Element Plus 管理后台，参考 `pure-admin/pure-admin-thin` 的 MIT 许可版本建立。

当前包含工作台、活动配置、名单统计和订单管理。订单详情可按选中人员试算退款并模拟成功或失败；模拟不会执行退款，也不会修改订单、名单和名额。登录页已接入正式工作人员账号，支持权限范围、首次改密、禁用和重置。

## 本地脚本

每个新的 PowerShell 会话先把 Node 22.23.2 放到 PATH 最前面，再使用裸 `pnpm`。这样 `pnpm` 脚本内部调用的 `pnpm` 和 Playwright webServer 也会继承同一个 Node 版本。

```powershell
$env:Path = 'D:\Software\Node-v22.23.2;' + $env:Path
pnpm --filter @linan/admin dev
pnpm --filter @linan/admin lint
pnpm --filter @linan/admin typecheck
pnpm --filter @linan/admin test
pnpm --filter @linan/admin test:e2e
pnpm --filter @linan/admin build
```

本地启动 API 后访问后台的 `/orders` 可查看订单。开发及隔离验收须将 `VITE_API_BASE_URL` 指向对应本地 API，不能误连云端；生产模式禁用开发身份头，使用正式工作人员账号。当前云端 HTTPS、身份及 API 地址见[云端部署说明](../../deploy/cloud-test/README.md)。
