# PC 管理后台

Vue 3、Vite、TypeScript 和 Element Plus 管理后台，参考 `pure-admin/pure-admin-thin` 的 MIT 许可版本建立。

当前包含工作台、活动配置、名单统计和订单管理。订单详情可按选中人员试算退款并模拟成功或失败；模拟不会执行退款，也不会修改订单、名单和名额。登录页仍是本地演示入口，正式工作人员身份尚未接入。

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

本地启动 API 后访问后台的 `/orders` 可查看订单。开发环境使用现有演示工作人员身份；生产模式禁用该身份。未配置公开 HTTPS 与正式身份前，不能把此页面作为对外业务入口。
