# PC 管理后台

Vue 3、Vite、TypeScript 和 Element Plus 的最小后台骨架，参考 `pure-admin/pure-admin-thin` 的 MIT 许可版本建立。

当前只包含启动所需的登录壳、管理布局和空首页结构，不包含产品功能、预置登录信息、模拟业务数据或第三方服务凭据。

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
