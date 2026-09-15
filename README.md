# 临安文旅数字化平台

本仓库承载临安旅游集散中心数字化系统的应用代码、技术设计、测试和部署配置。原始合同、客户资料、身份证件、支付证书、生产数据和导出文件不进入本仓库。

## 当前状态

- 2026-09-15：仓库、架构、设计、开源、存储和执行计划已通过双重开发前终审。
- 详细执行计划16项中已完成2项；应用代码尚未初始化，Todo 3等待用户明确授权。
- C盘清理历史记录曾达到47.11GB可用；2026-09-15安装前复核约36.78GiB，并通过实时 `(Get-PSDrive -Name C).Free -ge 35GB` 闸门。安装依赖前必须重新测量，低于该闸门即停止；授权后目标为24小时代码完整、72小时形成UAT候选版、3—5天形成稳定版。
- 小程序正式名称、AppID、腾讯云资源和微信支付参数将在需求方提供后通过环境配置接入，不写死在代码中。

## 计划中的目录

```text
apps/
  api/        NestJS 模块化单体 API
  admin/      Vue 3 PC 管理后台
  miniapp/    uni-app + Vue 3 微信小程序
packages/
  contracts/  共享接口、状态枚举和校验定义
deploy/       Docker Compose、Nginx 与部署说明
docs/         范围、架构、计划、保护和调研记录
third_party/  第三方来源、版本与许可证台账
```

## 开工入口

1. 每次新克隆后运行 `npm run repo:setup`，恢复本地Git保护并报告磁盘容量。
2. 运行 `npm run repo:verify`，确认仓库没有跟踪密钥、客户数据或大文件。
3. 阅读 `docs/项目计划与进度.md`，确认当天任务和里程碑。
4. 阅读 `docs/需求方交接清单.md`，准备需求方账号和资料。
5. 阅读 `docs/开发保护与恢复规则.md`，遵守分支、密钥、数据和备份规则。
6. 前端开发前必须先阅读根目录 `DESIGN.md`。

## 本地前置条件

- Node.js 22.23.2（NestJS 12 脚手架所需的 Node 22 LTS 基线）
- pnpm 12.4.1（计划通过 Corepack 管理）
- Git 2.43+
- Docker Desktop（保留现有镜像和卷，可启动本项目开发环境）
- 微信开发者工具（取得 AppID 后安装和配置）

## Node 与 pnpm 激活

本机默认 Node 仍可能不是本项目要求的版本。每个新的 PowerShell 会话先执行以下命令，让裸 `pnpm`、脚本内嵌的 `pnpm` 和 Playwright webServer 都继承 `D:\Software\Node-v22.23.2`：

```powershell
$env:Path = 'D:\Software\Node-v22.23.2;' + $env:Path
node -v
pnpm --version
```

确认输出为 `v22.23.2` 和 `12.4.1` 后，再运行仓库脚本：

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm typecheck
pnpm test
```
