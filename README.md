# 临安文旅数字化平台

本仓库承载临安旅游集散中心数字化系统的应用代码、技术设计、测试和部署配置。原始合同、客户资料、身份证件、支付证书、生产数据和导出文件不进入本仓库。

## 当前状态

- 已实现 API、管理后台和微信小程序，包含活动与团期、报名与订单、支付退款、名单与分车、行前确认、执行记录、健康授权、评价和归档。
- 当前处于正式交付验收阶段。代码测试、候选上传与业务验收分别记录；手机消息实收、保险交接、影像服务及业务方签认仍需实际回执，不能用接口成功代替。
- 登录隐私按版本记住一次：未同意者在主动登录或报名需要登录时、填写资料前确认；保存后进入独立订阅选择，跳过或拒绝订阅仍可完成登录。
- 仓库按项目方授权暂时公开。`main` 要求通过 Pull Request 和四项自动检查合并，禁止强制推送和删除；开发中的功能分支不等于已部署版本。
- 尚待业务方决定的规则见[待业务确认事项表](docs/待业务确认事项表-20261003.md)，依赖修补与审计例外见[依赖安全补丁说明](docs/依赖安全补丁说明.md)。

## 目录

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
- pnpm 12.4.1（通过 Corepack 使用仓库锁定版本）
- Git 2.43+
- Docker Desktop（保留现有镜像和卷，可启动本项目开发环境）
- 微信开发者工具（小程序开发与预览需对应项目权限）

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
