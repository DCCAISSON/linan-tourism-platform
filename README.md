# 临安文旅数字化平台

本仓库承载临安旅游集散中心数字化系统的应用代码、技术设计、测试和部署配置。原始合同、客户资料、身份证件、支付证书、生产数据和导出文件不进入本仓库。

## 当前状态

- 2026-09-14：完成独立 Git 仓库、目录边界、密钥与大文件保护、开发计划、架构基线、设计基线和开源调研。
- 应用代码尚未初始化；先释放本机磁盘空间，再安装依赖。
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

1. 阅读 `docs/PROJECT_PLAN.md`，确认当天任务和里程碑。
2. 阅读 `docs/TOMORROW_HANDOFF_CHECKLIST.md`，准备需求方账号和资料。
3. 阅读 `docs/DEVELOPMENT_PROTECTION.md`，遵守分支、密钥、数据和备份规则。
4. 前端开发前必须先阅读根目录 `DESIGN.md`。

## 本地前置条件

- Node.js 22.17.x
- pnpm 12.4.1（计划通过 Corepack 管理）
- Git 2.43+
- Docker Desktop（安装依赖前需先释放磁盘空间）
- 微信开发者工具（取得 AppID 后安装和配置）
