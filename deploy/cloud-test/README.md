# 云端测试部署

本目录保留云端受控环境的部署配置，目录名沿用早期测试阶段。2026-10-04 已在 HTTPS 环境部署 API 和管理后台，接入真实微信身份及微信支付 API v3，并有受控真实支付、退款记录。模拟数据演练必须在隔离环境执行，不能把当前云端当作纯模拟环境；正式团期开放、手机消息实收、保险及影像服务仍须分别完成业务验收。

## 运行结构

- 程序目录：`/opt/linan-test/app`。
- API 进程：`linan-test-api.service`，由 systemd 管理，工作目录为 `/opt/linan-test/app/apps/api`。
- API 只监听服务器回环地址，管理后台通过 Nginx 受保护 HTTPS 入口访问；小程序 API 使用独立 HTTPS 域名和应用身份校验。
- 业务库由受控 `DATABASE_URL` 指定，库名和本地 UAT 不得互换。本地 Compose 的空密码配置不用于云端。2026-10-04只读核验确认线上密码非空、环境文件权限为600；专用最小权限应用账号仍待配置和验证。
- 后台构建时使用 `VITE_API_BASE_URL=/api`，由同源 Nginx 转发 API。
- 公众官网由 `apps/site/dist` 提供，根域名和 `www` 不启用 Basic Auth。备案号、公安备案号和公开联系方式由构建环境变量注入，未提供时页面只显示待同步说明。

公众官网构建示例：

```bash
SITE_ICP_NUMBER='<网站 ICP 备案号>' \
SITE_PUBLIC_SECURITY_NUMBER='<公安联网备案号>' \
SITE_PUBLIC_SECURITY_URL='<公安备案查询链接>' \
SITE_CONTACT_PHONE='<公开业务电话>' \
SITE_CONTACT_EMAIL='<公开业务邮箱>' \
corepack pnpm --filter @linan/site build
```

新环境或域名变更时，须将 `linantravel.cn` 和需要启用的 `www.linantravel.cn` 解析到目标服务器，并签发覆盖根域名、`www`、`admin`、`api` 的证书，替换 Nginx 配置前执行 `nginx -t`。当前受控环境已有 HTTPS；以下要求用于重建或变更，不能据此判断线上仍在等待备案或证书。

## `/etc/linan-test/api.env` 必填项

该文件必须由服务器 root 持有，权限 `600`，不得提交到 Git。

```bash
DATABASE_URL=mysql://...
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
ADMIN_WEB_ORIGIN=https://admin.linantravel.cn
PERSON_DATA_ENCRYPTION_KEY_BASE64=<32-byte-random-base64>
REVISION=<deployed-source-or-manifest-revision>
```

当前真实微信身份使用 `NODE_ENV=production`、正式 AppID/AppSecret 及 `nginx-miniapp-experience.conf`。新环境启用前必须核对这些配置；API 域名不使用 Basic Auth，因此开发身份头和模拟资金接口必须被生产模式拒绝。

```bash
WECHAT_MINIAPP_APP_ID=<正式AppID>
WECHAT_MINIAPP_APP_SECRET=<正式AppSecret>
```

微信支付启用项、商户参数、API v3 密钥和证书/公钥配置项见[根目录环境模板](../../.env.example)；模板不含实际凭据，不能仅设置开关便认为真实支付验收完成。

首次创建测试主管理员时，还需要临时写入并执行 bootstrap，完成后可移除：

```bash
STAFF_ADMIN_USERNAME=<test-admin-username>
STAFF_ADMIN_TEMP_PASSWORD=<12+ character temporary password>
STAFF_ADMIN_DISPLAY_NAME=测试主管理员
```

执行：

```bash
cd /opt/linan-test/app
corepack pnpm --filter @linan/api staff:bootstrap-admin
```

## 当前发布验收口径

- 当前迁移链路包含 42 个迁移文件，空数据库全链路迁移已通过；已部署数据库按自己的迁移记录核对，不重复执行历史迁移。
- 价格由活动和团期配置，订单保存明细及金额快照。金额以整数分计算，退款按明细分配和可退余额核对，不能按取消人数直接推算；真实退款以渠道确认结果为准。
- `GET /health` 必须返回 `revision`，并通过发布清单追溯到已测试的源码提交及产物摘要。若 revision 是清单摘要，不要求其字面等于 Git SHA；每次发布必须记录二者映射，不能用随时变化的分支 HEAD 代替。
- systemd 验收要求：`systemctl is-active linan-test-api` 和 `systemctl is-enabled linan-test-api` 均通过。
- 2026-10-04 的 API/后台修复已部署，源文件与主分支 `5f2f57c` 对应；本次部署没有执行数据库迁移或恢复数据库。小程序 0.3.39 尚无上传成功回执，后续候选须单独记录上传结果，不能将服务器部署算作小程序已更新。

## 必验流程

1. 主账号登录，创建子账号，勾选权限和范围。
2. 子账号首次登录强制改密，禁用和重置后状态正确。
3. 三类名单模板导入成功；重复导入跳过；逐行错误可见；导入不改变订单和已付款统计。
4. 版本化告知书激活后，报名必须精确同意当前版本。
5. 车辆安排保存、容量刚好通过、超载失败、九列 Excel 导出。
6. 隔离环境验证多人订单、模拟支付和明细退款分配；真实渠道验证必须限定已授权的订单、金额和次数，分别核对支付、退款、有效名单与名额，覆盖重复回调、分次及全额退款。不得在云端随意创建真实资金交易作探针。
7. 失败探针：缺加密 key、过期/禁用账号、错误 workbook、stale notice、车辆 overload、服务重启恢复。

## 候选发布包与回滚口径

候选发布必须基于“最终已测试提交”的完整 SHA，不用旧包或含义不明的 `HEAD` 替代。仓库提供的源码归档入口为：

```bash
bash deploy/cloud-test/prepare-release-candidate.sh <tested-commit-sha>
```

脚本只在本地生成候选 tarball 和 manifest，不上传、不部署、不重启远端。它会校验：

- `<tested-commit-sha>` 是真实 commit；
- 该 commit 等于当前 `HEAD`；
- 工作区干净。若仍有未提交或未追踪源码，脚本失败，因为这些内容不会进入 `git archive`。

候选包 manifest 记录 archive sha256、目标候选目录 `/opt/linan-test/app-candidate-<short-sha>`、当前目录 `/opt/linan-test/app` 和回滚提示。实际发布时应先保留 `/opt/linan-test/app-backup-<short-sha>`，再切换候选目录；失败只回滚应用目录和服务版本，不盲目 down 数据库迁移。

## 日常微信账单核对

`reconcile-wechat-bill.mjs` 复用当前部署的 `WechatReconciliationService`，只下载账单、查询交易并保存对账结果，不发起支付或退款。每天北京时间 10:05 核对北京时间昨日；日期计算不依赖服务器时区。服务通过同一个 `flock` 锁串行执行，人工补跑也必须使用该锁。不要与后台针对同日的手动核对同时操作。

2026-10-04 已安装并核对 runner、service、timer，timer 为 enabled/active，首次自然触发计划为 2026-10-05 10:05（北京时间）。手工经同一 flock 执行的 2026-10-03 账单核对返回 `NO_STATEMENT_EXIST`，未形成成功对账记录，不计零差异；商户仍须核对当日交易，之后确认自然触发及告警实收。原 `linan-refund-bill-20260930.timer` 为一次性历史作业，文件和结果保留。

以下命令用于新环境安装或经审核的更新。已安装环境先核对现有文件、版本和日程，不重复覆盖；在已审核的候选源码根目录，由部署负责人执行：

```bash
sudo install -d -o root -g root -m 700 /opt/linan-test/ops /var/lib/linan-wechat-bill-reconciliation
sudo install -o root -g root -m 600 deploy/cloud-test/reconcile-wechat-bill.mjs /opt/linan-test/ops/reconcile-wechat-bill.mjs
sudo install -o root -g root -m 644 deploy/cloud-test/linan-wechat-bill-reconciliation.service /etc/systemd/system/linan-wechat-bill-reconciliation.service
sudo install -o root -g root -m 644 deploy/cloud-test/linan-wechat-bill-reconciliation.timer /etc/systemd/system/linan-wechat-bill-reconciliation.timer
sudo /opt/node-v22.23.2-linux-x64/bin/node --check /opt/linan-test/ops/reconcile-wechat-bill.mjs
sudo systemd-analyze verify /etc/systemd/system/linan-wechat-bill-reconciliation.service /etc/systemd/system/linan-wechat-bill-reconciliation.timer
sudo systemctl daemon-reload
sudo systemctl enable --now linan-wechat-bill-reconciliation.timer
sudo systemctl show linan-wechat-bill-reconciliation.timer -p ActiveState -p NextElapseUSecRealtime
```

安装前确认上述 Node、flock、受控环境文件和当前 API 编译产物实际存在；安装后将源文件摘要、候选版本及 `NextElapseUSecRealtime` 记入部署回执。系统重启后的 `Persistent=true` 只补触发一次，runner 仍核对当时的昨日，不会自动补齐停机期间全部日期。财务须逐日核对缺口，按批准日期补跑：

```bash
sudo /usr/bin/flock --nonblock --conflict-exit-code 75 /run/lock/linan-wechat-bill-reconciliation.lock /opt/node-v22.23.2-linux-x64/bin/node --env-file=/etc/linan-test/api.env /opt/linan-test/ops/reconcile-wechat-bill.mjs YYYY-MM-DD
```

占位日期须替换为已结束的实际账单日；当天、未来、非法日期直接拒绝。相同日期复用现有后端按账单日更新结果的逻辑，不新增付款或退款；每次运行摘要追加到 root 受控的 `/var/lib/linan-wechat-bill-reconciliation/YYYY-MM-DD.jsonl`，保留重跑与失败历史。摘要只记日期、时间、账单摘要、差异数和错误码，不记订单号、人员或凭据。摘要不再把差异记录中的金额求和冒充整日支付/退款总额。

|退出码|含义|处理|
|---|---|---|
|0|核对完成且差异为零|核对后台账单日及摘要，记录当日完成。|
|2|核对完成但存在差异|财务在后台逐条核对；不得自动确认或重新退款。|
|1|日期、账单下载、查询、连接关闭或回执写入失败|部署负责人查看脱敏错误码；账单缺失不能按零交易成功处理，修复后按原日期补跑。|
|75|已有作业持锁|确认正在运行者和目标日期；结束后检查是否已经产生本日结果。|

每日核查同时查看 `systemctl show linan-wechat-bill-reconciliation.service -p Result -p ExecMainStatus`、`journalctl -u linan-wechat-bill-reconciliation.service --since today --no-pager -o cat`、目标日期 jsonl 及后台对账结果。退出 0、timer active 都不能单独证明连续日期无遗漏。超时或进程被杀时以 systemd 失败记录为准，可能尚未写入 jsonl。

告警沿用现有运维渠道，由运维负责人确认“作业失败、差异非零、逾期无结果”的接收人和处理时限，再做一次无真实资金的失败告警实收验证。本模板不发送消息、不新增收费监控，也不宣称告警已经送达。财务复核人与运维当班人未指定前，此项交接仍未完成。

暂停只停用新 timer：`sudo systemctl disable --now linan-wechat-bill-reconciliation.timer`；不删除对账记录、历史作业或备份。应用回滚需核对当前 API 编译产物兼容性后再恢复日程。

本地调度回归：从仓库根目录运行 `node --experimental-vm-modules deploy/cloud-test/reconcile-wechat-bill.test.mjs`。它验证真实 runner 的日期、退出码和脱敏回执，微信服务使用合成返回，不访问真实账单或生产数据库。

恢复应用时必须配对备份时点、实际部署产物及迁移记录。10月3日的83表快照不能直接配对后续89表版本；本轮隔离验证已用线上产物执行四项待执行迁移后，再以只读账号启动应用、读取学校/课程/团期并核对原金额和关联查询。升级只在隔离副本先验证；不要在生产盲目重放历史迁移。数据库恢复、独立密钥副本可取得、媒体读回、各角色实际接手分别留回执。
