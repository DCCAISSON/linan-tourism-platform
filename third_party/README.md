# 第三方来源台账

任何复制、修改或生成自开源项目的代码，合入前必须记录：

- 项目名称与官方仓库地址；
- 固定的提交 SHA 或版本号；
- 许可证及需要保留的声明；
- 实际复制的文件和修改说明；
- 安全、依赖和维护状态检查结果。

默认允许经审查的 MIT、Apache-2.0、BSD 类许可证。GPL、AGPL、SSPL、无许可证或许可证不清楚的代码不得直接合入。

## pure-admin-thin

- 项目名称：`pure-admin/pure-admin-thin`
- 官方仓库：<https://github.com/pure-admin/pure-admin-thin>
- 固定提交：`f0ff132561ab684bb78379239adf29f9a38ac7f1`
- 许可证：MIT
- 保留声明：`apps/admin/THIRD_PARTY_NOTICES/pure-admin-thin-MIT.txt`
- 实际复制路径：
  - `index.html` -> `apps/admin/index.html`，保留 Vite HTML 入口结构并改为本项目标题与描述。
  - `package.json` -> `apps/admin/package.json`，保留 Vue 3、Vite、TypeScript、Element Plus 技术栈，移除样例、模拟服务、图表、HTTP、样式审计和无关插件依赖。
  - `tsconfig.json` -> `apps/admin/tsconfig.json`，保留 Vite/Vue 类型检查入口并改为本项目严格 TypeScript 配置。
  - `vite.config.ts` -> `apps/admin/vite.config.ts`，保留 Vite + Vue 插件入口并移除原项目 build 插件体系。
  - `src/main.ts`、`src/App.vue`、`src/router/index.ts` -> `apps/admin/src/**`，保留应用挂载、路由和 Element Plus 壳结构并重写为本项目登录壳、后台布局和空首页。
- 安全、依赖和维护状态检查：本次只导入最小启动壳；没有复制原项目样例目录、预置登录信息、样例页面、原项目品牌资产、完整菜单权限系统或历史目录。
