# 项目文件管理与同步

## 工作区分层

```text
临安文旅开发/
  202609xx_*             原始业务材料，不进入代码Git
  对话记录与相关文件/      会议与沟通材料，不进入代码Git
  linan-platform/         独立代码Git仓库
```

仓库内只保留经过整理的需求结论和技术决策，不复制含个人信息、印章、证件或商业敏感内容的原文件。

## 推荐仓库结构

```text
linan-platform/
  apps/api
  apps/admin
  apps/miniapp
  packages/contracts
  deploy
  docs
  third_party
  .omo/plans
```

## Codex并行开发

- 每条Codex任务使用独立分支和独立worktree。
- API、小程序、后台分别拥有文件边界；共享契约和数据库迁移由集成负责人串行合并。
- 任务开始时固定输入：目标、允许修改路径、禁止修改的不变量、验收命令和证据位置。
- 不让两个任务同时修改同一迁移、同一状态枚举或同一支付状态机。
- 每日合并至少一次端到端链路，减少长分支漂移。

## 同步顺序

```text
git fetch --prune
git switch main
git pull --ff-only
git switch -c feat/<module>-<result>
# 开发、验证、提交、推送
# 创建Pull Request并通过检查后合并
```

主远端负责协作，镜像远端只负责灾备。禁止把同一个分支分别在GitHub和Gitee独立提交后再互相覆盖。

## 文件命名

- 代码、目录和数据库字段使用英文小写与现有框架规范。
- 业务文档使用中文标题，文件名包含主题，不使用“最终版2”“最新版”等模糊词。
- 数据库迁移使用时间戳和单一目的，例如 `202609151030_create_enrollment_tables`。
- 导出模板必须是空模板或虚构样例；真实导出文件进入被忽略的 `exports/`。
