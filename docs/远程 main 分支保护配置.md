# 远程 main 分支保护配置

本文档只记录远程仓库建立后的人工配置项；本次本地任务不创建远程仓库、不推送、不开 PR，也不写入外部平台。

## 保护目标

远程仓库创建后，`main` 只保留可构建、可测试、可部署的代码。所有业务功能从功能分支进入 Pull Request，经 CI 通过和人工复核后合并。

## GitHub 规则

在 GitHub 仓库的 branch protection 或 ruleset 中，为 `main` 配置：

- Require a pull request before merging。
- Require status checks before merging，并在首次 CI 跑出检查项后选择这些必需检查：`quality-gates`、`e2e`、`dependency-audit`、`secret-scan`。
- Require branches to be up to date before merging。
- Require conversation resolution before merging。
- Require linear history。
- Do not allow force pushes。
- Do not allow deletions。
- 自动删除已合并的功能分支。

## CI 检查含义

- `quality-gates`：安装锁定依赖后运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- `e2e`：启动 MySQL 8.4 测试服务，运行包含真实迁移和回滚约束的 API e2e，再运行后台 Playwright e2e。小程序微信开发者工具自动化依赖 `WECHAT_DEVTOOLS_CLI` 和本地开发者工具，保留为交付前外部闸门。
- `dependency-audit`：运行 `pnpm audit --prod --audit-level high`，阻断生产依赖中的高危和严重漏洞。
- `secret-scan`：使用 Gitleaks 扫描 Git 历史和当前内容中的硬编码密钥。

## 外部闸门

远程仓库建立后，由仓库管理员完成以下动作：

- 创建私有远程仓库，并将本地分支推送到远程。
- 启用上文列出的 `main` 保护规则。
- 如远程仓库属于组织账户，按 Gitleaks Action 要求配置组织可用的 `GITLEAKS_LICENSE` secret；个人账户通常不需要。
- 首次 PR 跑通后，把实际显示的 CI 检查项加入 required status checks。
- 在具备微信开发者工具 CLI 的机器上单独运行小程序 e2e，并把结果作为 UAT 前闸门。
