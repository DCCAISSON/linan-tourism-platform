# PC 管理后台

Vue 3、Vite、TypeScript 和 Element Plus 的最小后台骨架，参考 `pure-admin/pure-admin-thin` 的 MIT 许可版本建立。

当前只包含启动所需的登录壳、管理布局和空首页结构，不包含产品功能、预置登录信息、模拟业务数据或第三方服务凭据。

## 本地脚本

所有 Node 命令在本机执行时请显式使用 `D:\Software\Node-v22.23.2` 下的 Node/Corepack/pnpm。

```powershell
& 'D:\Software\Node-v22.23.2\corepack.cmd' pnpm --filter @linan/admin dev
& 'D:\Software\Node-v22.23.2\corepack.cmd' pnpm --filter @linan/admin typecheck
& 'D:\Software\Node-v22.23.2\corepack.cmd' pnpm --filter @linan/admin test
& 'D:\Software\Node-v22.23.2\corepack.cmd' pnpm --filter @linan/admin test:e2e
& 'D:\Software\Node-v22.23.2\corepack.cmd' pnpm --filter @linan/admin build
```
