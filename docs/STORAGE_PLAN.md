# 开发存储与容量计划

检查时间：2026-09-14

## 当前状态

| 项目 | 结果 |
| --- | ---: |
| C盘可用空间 | 约7.97GB |
| D盘可用空间 | 约22.80GB |
| E盘可用空间 | 约672.58GB |
| 当前需求材料目录 | 约375.89MB |
| 本机npm缓存 | 约3.99GB |
| Docker本地目录 | 约2.60GB |
| Docker数据盘文件 | 约2.43GB |
| Docker引擎 | 当前未运行 |

## 项目容量估计

| 内容 | 开发期预计占用 |
| --- | ---: |
| 源码、Git历史和技术文档 | 0.3–1GB |
| pnpm共享包仓和工作区依赖 | 2–4GB |
| 微信开发者工具 | 2–3GB |
| Docker镜像、容器和MySQL数据 | 4–8GB |
| 构建缓存、测试报告和截图 | 2–5GB |
| 安全余量 | 至少10GB |
| 合计 | 约20–31GB |

C盘当前空间不足以安全承载完整工具链。只有选择把源码、依赖、Docker和数据库都放在C盘时，才需要让C盘达到至少30GB可用，推荐40GB以上。

## 推荐开发位置

不要求完全基于腾讯云开发。结合当前磁盘条件，目标方案改为“E盘本地主开发 + 私有Git同步 + 腾讯云联调和部署”：

- E盘放主工作副本、pnpm store、工作区依赖、构建缓存和可重建的Docker开发资源。
- 本机完成编码、自动化检查、微信模拟器、真机预览、调试与上传，避免云端IDE的延迟和额外费用。
- 腾讯云承载私有Git之外的联调环境、测试数据库和正式部署；测试与生产环境分离。
- Cloud Studio保留为临时远程开发入口，不作为必需条件。

源码和开发工具可以放在E盘，C盘只保留Windows及不可迁移的应用数据，但仍建议至少保留15GB系统余量。

## E盘当前阻断项

2026-09-14复核结果：E盘是通过USB连接的 `Seagate BUP Slim`，物理磁盘状态为Healthy，但NTFS卷被标记为Dirty，`Get-Volume`显示 `Warning / Full Repair Needed`。只读 `chkdsk E: /scan` 无法创建快照并要求离线修复。

这不等于硬盘已经损坏，但在修复完成前，不把Git唯一工作副本、Docker磁盘或MySQL开发数据迁入E盘。执行顺序为：

1. 先备份E盘现有重要文件。
2. 关闭占用E盘的程序后，以管理员身份运行 `chkdsk E: /f`；按Windows提示卸载卷或重启检查。
3. 确认 `fsutil dirty query E:` 不再报告Dirty，且 `Get-Volume -DriveLetter E` 恢复Healthy。
4. 建立私有Git远端，从远端克隆到 `E:\Projects\linan-platform`，不要直接剪切当前 `.git` 目录。
5. 在E盘副本运行仓库检查、三端启动和构建；全部通过前保留当前C盘副本。

腾讯云 Cloud Studio 支持浏览器开发、Git导入、终端和独立工作空间，可用于当前项目。若将MySQL和Docker也放入同一开发环境，优先选择4核8GB以上配置；磁盘不足时，改用独立的腾讯云开发服务器并配置40–80GB数据盘。Cloud Studio只作为开发环境，不能与正式生产服务器共用。

参考：[Cloud Studio产品概述](https://cloud.tencent.com/document/product/1039/72021)、[从Git仓库创建应用](https://cloud.tencent.com/document/product/1039/131765)、[Cloud Studio购买指南](https://cloud.tencent.com/document/buy-guide/1039/33503)。

## E盘修复后的目录布局

- 主工作副本使用 `E:\Projects\linan-platform`，并通过私有Git远端同步；E盘不得成为唯一副本。
- 将 pnpm store、Docker磁盘镜像、MySQL开发数据、测试上传文件和构建缓存放到E盘。
- 图片、视频和活动照片不在本地长期保存，开发期使用少量虚构样本，生产使用COS。
- npm缓存和Docker资源只在确认没有其他项目依赖后清理；本次初始化没有自动删除任何缓存、镜像或数据卷。
