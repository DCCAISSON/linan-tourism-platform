# 云端测试部署

本目录保留云端受控环境的部署配置，目录名沿用早期测试阶段。2026-10-04 已在 HTTPS 环境部署 API 和管理后台，接入真实微信身份及微信支付 API v3，并有受控真实支付、退款记录。模拟数据演练必须在隔离环境执行，不能把当前云端当作纯模拟环境；正式团期开放、手机消息实收、保险及影像服务仍须分别完成业务验收。

## 运行结构

- 程序目录：`/opt/linan-test/app`。
- API 进程：`linan-test-api.service`，由 systemd 管理，工作目录为 `/opt/linan-test/app/apps/api`。
- API 只监听服务器回环地址，管理后台通过 Nginx 受保护 HTTPS 入口访问；小程序 API 使用独立 HTTPS 域名和应用身份校验。
- 业务库由受控 `DATABASE_URL` 指定，库名和本地 UAT 不得互换。本地 Compose 的空密码配置不用于云端。2026-10-04 23:54（北京时间）已切换为专用应用账号 `linan_app`，仅允许已核验应用内网来源访问指定业务库，权限为 `SELECT, INSERT, UPDATE, DELETE`；环境文件权限为 `600`。
- 当前后台产物未覆盖 `VITE_API_BASE_URL`，生产默认调用 `https://api.linantravel.cn`。重建时沿用该地址；模板保留的后台 `/api/` 代理不是当前产物实际调用路径。
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

当前整站部署只使用 [nginx-miniapp-experience.conf](nginx-miniapp-experience.conf)。不要批量启用本目录所有 `nginx*.conf`，也不要同时启用下列历史模板。

| 模板 | 用途 |
| --- | --- |
| `nginx-miniapp-experience.conf` | 当前完整配置，包含 HTTP 跳转、ACME 验证和四个 HTTPS 域名；后台保留 Basic Auth，官网和 API 不启用 Basic Auth，API 业务权限由应用校验。 |
| [nginx-https-legacy-protected.conf](nginx-https-legacy-protected.conf) | 早期受保护环境参考。API 上的 Basic Auth 会阻断小程序和微信回调，不用于当前微信环境。 |
| [nginx-http.conf](nginx-http.conf) | 早期 HTTP/证书引导参考，当前完整配置已包含端口 80。 |

配置变更后核对：未提供 Basic Auth 凭据的后台请求返回 401，API `/health` 无 Basic Auth 挑战且返回正确 revision，业务接口仍执行登录及权限校验。2026-10-04 已分别使用 `nginx -t` 验证三个模板，并核对上述线上响应；未改变运行配置或 reload。修改模板说明或历史文件名本身不需要重启线上 Nginx。

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

## 应用凭据与迁移凭据分开使用

`api.env` 中的数据库身份供 API、既有数据库备份脚本和日账单 runner 使用。应用启动保持 `synchronize:false`、`migrationsRun:false`；运行账号没有建表、改表、授权或访问系统库的权限。2026-10-04 的切换只改 `DATABASE_URL`，原管理员账号及权限保持，业务全表内容和金额摘要未变；新账号已实际完成既有备份脚本，API 读取和未登录拒绝均通过。

原 root 凭据以受控方式保留，供显式迁移、管理和回退；不把它重新写回日常应用配置。后续迁移由部署负责人通过独立受控会话取得管理凭据，先核对目标库、迁移记录、备份和候选版本，再执行已审定迁移；不要直接用低权限 `api.env` 跑迁移，也不要为此给应用账号增加 DDL 权限。迁移后退出管理会话，以应用账号核验 `/health`、业务读取、权限拒绝、备份和日账单连接，记录部署版本与迁移结果。凭据内容和受控副本位置经私下交接，不放入源码、终端输出或公开文档。

## 发布验收口径与最近已验证记录

- 当前迁移链路包含 42 个迁移文件，空数据库全链路迁移已通过；已部署数据库按自己的迁移记录核对，不重复执行历史迁移。
- 价格由活动和团期配置，订单保存明细及金额快照。金额以整数分计算，退款按明细分配和可退余额核对，不能按取消人数直接推算；真实退款以渠道确认结果为准。
- `GET /health` 必须返回 `revision`，并通过发布清单追溯到已测试的源码提交及产物摘要。若 revision 是清单摘要，不要求其字面等于 Git SHA；每次发布必须记录二者映射，不能用随时变化的分支 HEAD 代替。
- systemd 验收要求：`systemctl is-active linan-test-api` 和 `systemctl is-enabled linan-test-api` 均通过。
- 本轮变更见 [PR #4](https://github.com/DCCAISSON/linan-tourism-platform/pull/4)。最近已验证部署记录：2026-10-05 01:34（北京时间）API、管理后台及账单 runner 发布成功，revision 为源码提交 `20c32f5ad688f92c4a1b86d926920c0824dddae9`，[该源码四项 CI](https://github.com/DCCAISSON/linan-tourism-platform/actions/runs/37220504419) 均通过。本次发布未执行数据库迁移或恢复数据库，财务记录数量、金额及行摘要保持一致，最小权限账号和定时日程未变；三个后台静态文件均返回 200 且摘要匹配。后续源码与部署的对应以发布清单为准，[实时主分支](https://github.com/DCCAISSON/linan-tourism-platform/tree/main)变化不会自动更新服务器。
- 小程序 0.3.40 开发版上传及预览成功，冻结产物和上传回执已核验；尚未设为体验版、提审或正式发布。开发者工具原生界面验证通过，手机实际手机号授权、订阅实收和正确跳转仍待验收。服务器部署不能代替小程序发布，CI 不能代替真实外部服务验收。

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

`reconcile-wechat-bill.mjs` 复用当前部署的 `WechatReconciliationService`，下载账单、查询交易；取得账单后才保存对账结果，不发起支付或退款。每天北京时间 10:05 核对北京时间昨日；日期计算不依赖服务器时区。服务通过同一个 `flock` 锁串行执行，人工补跑也必须使用该锁。不要与后台针对同日的手动核对同时操作。

2026-10-04 已安装并核对 runner、service、timer，timer 为 enabled/active；10月5日 01:34 更新 runner 后日程保持不变，首次自然触发计划为当日 10:05（北京时间）。截至 01:35 的本次核验尚未自然触发，告警实收仍待验收。原 `linan-refund-bill-20260930.timer` 为一次性历史作业，文件和结果保留。

2026-10-05 01:35 已对 10月3日执行真实渠道只读核查：微信仍无该日账单，本系统全部 4 笔候选支付（含 1 笔待支付）及 4 笔退款均完成查单，8 个响应全部通过验签。1 次账单请求加 8 次查单均为 GET，结果为 `no_statement_no_local_transactions`、`completed=false`，确认这些候选记录在 10月3日没有支付成功或退款受理。核查前后七张相关表的行摘要一致，三个只读事务均已回滚、连接已关闭，没有生产写入或成功对账记录。该结论不能扩大为商户全部来源无交易，也不计零差异；如需商户全量结论，仍须核对商户平台全部交易来源。

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
|0，`code=matched`、`completed=true`|取得账单，核对完成且差异为零|核对后台账单日及摘要，记录当日对账完成。|
|0，`code=no_statement_no_local_transactions`、`completed=false`|微信无账单；本系统已知全部微信支付和退款经渠道查单确认目标日无发生|登记“无账单，本系统已知交易当日无发生”；不写成功对账记录，不计零差异，也不代表商户全部渠道无交易。|
|2|核对完成但存在差异|财务在后台逐条核对；不得自动确认或重新退款。|
|1|日期、账单下载、查询、连接关闭或回执写入失败；或缺账单且查到当日真实交易、仍有交易时间/状态不明|部署负责人和财务查看脱敏错误码，核实渠道记录；不能按零交易成功处理。|
|75|已有作业持锁|确认正在运行者和目标日期；结束后检查是否已经产生本日结果。|

每日核查同时查看 `systemctl show linan-wechat-bill-reconciliation.service -p Result -p ExecMainStatus`、`journalctl -u linan-wechat-bill-reconciliation.service --since today --no-pager -o cat`、目标日期 jsonl 及后台对账结果。缺账单分类只依据渠道查单结果，不能用订单创建日、报名未付款或本地缺少时间来推定无交易。退出 0 须结合 `code`、`completed` 判断，timer active 不能证明连续日期无遗漏。超时或进程被杀时以 systemd 失败记录为准，可能尚未写入 jsonl。

告警沿用现有运维渠道，由运维负责人确认“作业失败、差异非零、逾期无结果”的接收人和处理时限，再做一次无真实资金的失败告警实收验证。本模板不发送消息、不新增收费监控，也不宣称告警已经送达。财务复核人与运维当班人未指定前，此项交接仍未完成。

暂停只停用新 timer：`sudo systemctl disable --now linan-wechat-bill-reconciliation.timer`；不删除对账记录、历史作业或备份。应用回滚需核对当前 API 编译产物兼容性后再恢复日程。

本地调度回归：从仓库根目录运行 `node --experimental-vm-modules deploy/cloud-test/reconcile-wechat-bill.test.mjs`。它验证真实 runner 的日期、退出码和脱敏回执，微信服务使用合成返回，不访问真实账单或生产数据库。

## 持续备份与恢复

数据库备份 timer 已启用，2026-10-04 02:30（北京时间）自然运行成功。10月4日 23:54 切换应用账号后，手工调用同一既有脚本生成了 89 表、673 行的新快照，逐表内容及金额摘要核对通过；脚本、timer 和保留规则均未改。新账号后的首次自然备份计划为 10月5日 02:30，须另取自然执行回执，不能用这次手工调用代替。

10月4日已把当日 18:49 的数据库快照、逐表清单、必要配置和密钥、配套应用产物及版本清单打包，并保存到受 ACL 限制的第二副本。在独立隔离环境实际恢复 89 表、673 行，逐表内容和五项金额/关联查询一致；恢复的个人信息密钥完成合成文本加解密，支付私钥完成本地随机挑战签名，平台公钥解析通过。配套应用的五个读取路由和两个未登录拒绝路由均通过，临时进程、连接、容器和应用目录已清理。该验证未读取真实个人明文，未向恢复应用注入微信或 COS 外发凭据。

新开发者接手恢复时，应先核对受控包摘要、备份时点、应用版本和迁移记录；用管理凭据导入独立隔离库，再用仅四种 DML 权限的应用账号启动，核对逐表摘要、金额/关联查询、读取和权限拒绝。恢复验证使用合成数据检查密钥，不直接启动一份带真实外发配置的生产环境副本；确认结果后清理本次隔离资源，不覆盖生产库或删除历史备份。

数据库与密钥的上述恢复已经验证，仍缺 COS 媒体完整恢复和第三方影像真实验收。第二副本目前在受控开发电脑，项目方独立保管人、接收人及交接签认仍待落实，不能记为完整灾后交付完成。
