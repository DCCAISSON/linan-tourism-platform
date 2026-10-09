# 云端测试部署

本目录保留云端受控环境的部署配置，目录名沿用早期测试阶段。2026-10-04 已在 HTTPS 环境部署 API 和管理后台，接入真实微信身份及微信支付 API v3，并有受控真实支付、退款记录。模拟数据演练必须在隔离环境执行，不能把当前云端当作纯模拟环境；正式团期开放、手机消息实收、保险及影像服务仍须分别完成业务验收。

## 运行结构

- 程序目录：`/opt/linan-test/app`。
- API 进程：`linan-test-api.service`，由 systemd 管理，工作目录为 `/opt/linan-test/app/apps/api`。
- API 只监听服务器回环地址，管理后台通过 Nginx 受保护 HTTPS 入口访问；小程序 API 使用独立 HTTPS 域名和应用身份校验。
- 业务库由受控 `DATABASE_URL` 指定，库名和本地 UAT 不得互换。本地 Compose 的空密码配置不用于云端。2026-10-04 23:54（北京时间）已切换为专用应用账号 `linan_app`，仅允许已核验应用内网来源访问指定业务库，权限为 `SELECT, INSERT, UPDATE, DELETE`；环境文件权限为 `600`。
- 当前后台产物显式设置 `VITE_API_BASE_URL=https://api.linantravel.cn`。重建时沿用该地址；模板保留的后台 `/api/` 代理不是当前产物实际调用路径。
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

- 当前迁移链路包含 43 个迁移文件，空数据库全链路迁移已通过；已部署数据库按自己的迁移记录核对，不重复执行历史迁移。
- 最新小程序为0.3.44开发版，2026-10-09 22:19（北京时间）上传成功；源码同为`d2803f866329cbf5a0facf545429ad4247496b9e`，官方回执1,888,312字节、冻结文件229个。中文备注“支持查看团期保险方案和参加人的投保结果”经CLI和开发者工具实际接收值双重核对；包摘要保持、临时网络与进程已清理。未设置体验版、提审或正式发布，真实手机和保险回执仍需验收。下文0.3.42为历史记录，旧冻结包保留。
- 最近已验证部署为2026-10-09 22:12（北京时间），API及后台revision `d2803f866329cbf5a0facf545429ad4247496b9e`，见[PR #9](https://github.com/DCCAISSON/linan-tourism-platform/pull/9)及[同一提交四项通过的CI](https://github.com/DCCAISSON/linan-tourism-platform/actions/runs/37941208836)。本次部署66个应用文件，新增团期保险方案与家长保障查询；仅执行`AddInsurancePlans1766025000000`，添加两个可空JSON字段，无历史回填。89张表旧列内容、财务金额和名单摘要不变，最小权限账号、Nginx、非REVISION环境、备份及对账日程保持；三个后台资源公网200且摘要匹配，两条保险读取接口匿名访问均401。迁移前已有备份实际恢复到独立数据库，89表730行与当时生产基线一致。上一应用版本`52afc105`已保留回退文件；应用回退保留新增字段与迁移记录，不执行生产库恢复或迁移down。
- 价格由活动和团期配置，订单保存明细及金额快照。金额以整数分计算，退款按明细分配和可退余额核对，不能按取消人数直接推算；真实退款以渠道确认结果为准。
- `GET /health` 必须返回 `revision`，并通过发布清单追溯到已测试的源码提交及产物摘要。若 revision 是清单摘要，不要求其字面等于 Git SHA；每次发布必须记录二者映射，不能用随时变化的分支 HEAD 代替。
- systemd 验收要求：`systemctl is-active linan-test-api` 和 `systemctl is-enabled linan-test-api` 均通过。
- 10月7日历史部署：09:18:37（北京时间），API及后台revision `d4db2f1e26788f973aa689629d23379b92186bc6`，见[PR #7](https://github.com/DCCAISSON/linan-tourism-platform/pull/7)和[该源码四项通过的CI](https://github.com/DCCAISSON/linan-tourism-platform/actions/runs/37555503003)。当时发布31个应用文件及Nginx配置，三个后台静态文件公网200且摘要匹配。新增课程封面上传、保存/发布提示、报名条件核对及已保存内容入口。真实staff账号通过API直连与后台代理各上传1,573,924字节PNG，匿名读回SHA一致，测试对象精确删除后404，测试会话已退出；未绑定真实课程。
- 上述10月7日部署保留财务数量、金额及行摘要、报名、参加人和名单摘要、89张表及42项迁移、最小权限账号和原定时任务；未执行数据库迁移/恢复、依赖安装、真实支付/退款或通知。服务器锁文件及node_modules保留，不将此前仓库安全补丁声称为服务器依赖升级。当时的回滚点为[PR #5](https://github.com/DCCAISSON/linan-tourism-platform/pull/5)的 `fddd6d2`，回滚文件位于 `/opt/linan-test/releases/catalog-publishing-20261007010816-da913074/backup`，旧哈希资源保留。后续文档提交和[主分支](https://github.com/DCCAISSON/linan-tourism-platform/tree/main)变化不会自动部署。
- 小程序0.3.42于10月7日首次预览、上传成功，08:52沿用原源码重传中文备注“优化长合同阅读和手写签字，保留阅读位置与签字草稿。”；0.3.41冻结包保留。对应源码 `aa20d88dc325dafbbb3ca019ec7a0b2c70da7863`，[四项CI](https://github.com/DCCAISSON/linan-tourism-platform/actions/runs/37503025685)通过。合同改为独立阅读/签字视图、底部操作入口、原位置及笔迹保留，原生隔离13项通过。原200个文件的清单和SHA保持一致，CLI及开发者工具接收的中文备注已核对，官方上传成功；公众平台备注未直接读回。首次官方包体1,610,341字节，两次重传均为1,755,754字节，差异原因未确认，不能将源码一致等同于微信编译包逐字节一致。本轮未操作体验版设置、提审或正式发布；手机本人手写、原生手机号授权、订阅实收仍待验收。服务器运行时node_modules未升级，相关待部署补丁详见[依赖安全补丁说明](../../docs/依赖安全补丁说明.md)。服务器部署不能代替小程序发布，CI不能代替真实外部服务验收。

后台封面操作：在“学校、课程与团期配置”的课程或共享模板中选取PNG/JPEG/WebP（最大5MiB），上传后预览并自动填入HTTPS地址，再保存内容。已发布内容保存后对外生效，共享模板影响其关联课程；家长重新进入对应页面读取更新。`POST /configuration/catalog-covers` 沿用配置写权限和Origin校验，`GET /catalog-covers/:uuid.ext` 只读取独立公开封面前缀；私有相册权限保持。仅该上传接口和后台 `/api/configuration/catalog-covers` 的精确代理路径设置 `client_max_body_size 6m`，供multipart开销使用；接口仍执行5MiB上限。

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

### 小程序与 API 兼容交接

API 发布必须继续支持已发布小程序使用的字段、类型、状态、业务错误码及登录方式；不删除字段、状态或既有成员更新接口别名。新增可选字段可以先发 API，再发小程序；新增枚举状态须验证旧客户端的解析和显示，不能仅因“增加字段”就认定兼容。发布前沿用现有契约回归核对登录、能力开关、报名、订单、支付及退款响应，支付回调的验签、重复通知和返回语义保持。

0.3.42 已于2026-10-07预览、上传开发版，0.3.41冻结包保留；本轮未设置体验版、提审或正式发布，不能据此设置最低强制客户端版本。后续若确需停止旧版本，须先核对微信实际发布版本、仍在使用的客户端及迁移安排，再由产品与发布负责人签认；本轮不增加版本拦截。

个人信息密钥的多密钥兼容（key ring）、密钥轮换，以及日志、备份、业务数据的保留和删除期限，列为长期待签认事项。须明确保管人、恢复需求、适用依据及历史数据处理方案后另行实施；本轮不轮换密钥、不设置自动删除期限。

## 日常微信账单核对

`reconcile-wechat-bill.mjs` 复用当前部署的 `WechatReconciliationService`，下载账单、查询交易；取得账单后才保存对账结果，不发起支付或退款。每天北京时间 10:05 核对北京时间昨日；日期计算不依赖服务器时区。服务通过同一个 `flock` 锁串行执行，人工补跑也必须使用该锁。不要与后台针对同日的手动核对同时操作。

2026-10-04 已安装并核对 runner、service、timer，timer 为 enabled/active；10月5日 01:34 更新 runner 后日程保持不变。10月5日 10:05:00（北京时间）首次自然触发，10:05:03 退出 0；10:16 的只读复核确认 timer、service、journal 调用记录及目标日 10月4日的 jsonl 一致。该日仅有一条 `completed=false`、`code=no_statement_no_local_transactions` 回执，表示无账单且本系统已知交易当日无发生，不是成功账单对账或零差异；数据库仍只有 9月28、29、30日三条对账记录。首次自然执行已验证，定时取得真实账单并完成对账、告警实收仍待验收。原 `linan-refund-bill-20260930.timer` 为一次性历史作业，文件和结果保留。

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

数据库备份 timer 已启用，2026-10-04 02:30（北京时间）自然运行成功；当日 23:54 切换应用账号后，同一既有脚本的手工备份也已验证。10月5日 02:30:01 新账号后的首次自然备份实际运行并退出 0，10:16 的只读复核确认 timer、service、journal 调用记录一致，生成的 SQL 为 89 表、673 行、361,738 字节，实际文件摘要与回执及逐表清单匹配。脚本、timer 和保留规则均未改，首次自然备份已验证。

10月4日已把当日 18:49 的数据库快照、逐表清单、必要配置和密钥、配套应用产物及版本清单打包，并保存到受 ACL 限制的第二副本。在独立隔离环境实际恢复 89 表、673 行，逐表内容和五项金额/关联查询一致；恢复的个人信息密钥完成合成文本加解密，支付私钥完成本地随机挑战签名，平台公钥解析通过。配套应用的五个读取路由和两个未登录拒绝路由均通过，临时进程、连接、容器和应用目录已清理。该验证未读取真实个人明文，未向恢复应用注入微信或 COS 外发凭据。

新开发者接手恢复时，应先核对受控包摘要、备份时点、应用版本和迁移记录；用管理凭据导入独立隔离库，再用仅四种 DML 权限的应用账号启动，核对逐表摘要、金额/关联查询、读取和权限拒绝。恢复验证使用合成数据检查密钥，不直接启动一份带真实外发配置的生产环境副本；确认结果后清理本次隔离资源，不覆盖生产库或删除历史备份。

数据库与密钥的上述恢复已经验证，仍缺 COS 媒体完整恢复和第三方影像真实验收。第二副本目前在受控开发电脑，项目方独立保管人、接收人及交接签认仍待落实，不能记为完整灾后交付完成。

## 一次只读运维检查

`check-operations.mjs` 使用现有 Node、API 依赖和受控环境文件，读取既有服务及回执，不运行备份、账单核对、迁移或退款，不写数据库或 COS，不发送通知。它是当前单服务器部署的人工检查入口，没有新增 timer、服务、依赖、环境变量或定时日程。候选源码部署后，在服务器运行：

```bash
sudo /opt/node-v22.23.2-linux-x64/bin/node --env-file=/etc/linan-test/api.env /opt/linan-test/app/deploy/cloud-test/check-operations.mjs
```

输出一行脱敏 JSON：`passed=true` 退出 0；任一失败、缺文件、读取失败或缺少请求日志样本均退出 1。仅看退出码不能判断原因，按 `checks[].name/code` 分项处理。脚本不输出凭据、证书或私钥正文、人员数据、原始日志和异常正文。

|检查|判定与处理|
|---|---|
|API 与版本|服务应 enabled/active；HTTPS `/health` 返回 200、正确服务名和与受控环境一致的 revision。该接口仍是进程健康检查，数据库和 COS 另查。|
|数据库、COS|以现有应用凭据执行 `SELECT 1` 和 COS `headBucket`，记录是否通过及耗时。`cos_probe_forbidden` 表示此桶探针没有权限，不据此断言所有对象操作均不可用。|
|最近 15 分钟请求|只解析 `http_request` JSON 并输出汇总。任意 API 5xx、支付/退款回调非 2xx 或连接中断均退出 1；回调 4xx、5xx、中断分别计数，交由值班人区分验签拒绝和服务故障。没有样本时数量为 null、代码为 `request_log_sample_missing`，不是零故障。|
|磁盘|应用、备份和对账回执所在文件系统均须至少剩余 1 GiB，且可用容量至少 10%；未达标时只报告，不删除文件。|
|证书与支付私钥|读取当前 HTTPS 证书及现有支付私钥同目录的 `apiclient_cert.pem`；剩余有效期不超过 30 天、尚未生效、缺失或不可解析均失败。商户证书序列号须匹配现有配置。私钥仅核对文件元数据：root/API 用户持有，实际 API 用户可读，禁止执行权限、组写和其他用户权限；root 持有且 API 所属组只读的 640 可通过。|
|备份|现有 timer 须 enabled/active，service 最新结果成功；检查最近应完成时点后的 SQL、manifest、字节数与 SHA-256。每日 02:30 后留 10 分钟，02:40 前检查上一轮，之后缺结果即失败。|
|对账|现有 timer/service 同样核对；每日 10:05 后留 10 分钟，10:15 前检查上一轮。检查相应已结束账单日的最新回执；差异非零、失败、缺失或过期均失败。`no_statement_no_local_transactions`、`completed=false` 可表示该次作业正常退出，但不记为成功对账或零差异。|

上述 10 分钟包括两个既有作业的 5 分钟执行上限及调度余量，不改变 timer。窗口之前保留上一轮检查要求，服务已报失败仍会直接报告。`inspection_failed` 表示该项未能核实，不能视为通过。

2026-10-05 12:21（北京时间）已将 `fddd6d2bd5c36b81dada23832a311363986d995b` 的 API、后台及本脚本部署到受控服务器，[该源码四项 CI](https://github.com/DCCAISSON/linan-tourism-platform/actions/runs/37262555238)均通过。部署后直接运行安装路径的脚本，退出0、17项检查通过；已采集10个结构化请求，未发现5xx、回调异常或中断，独立公网健康请求的 `X-Request-Id` 与实际日志对应。此前11:23旧部署的 `request_log_sample_missing` 回执保留为部署前记录，现已完成部署后验证。该结果只代表此次检查窗口，不代表持续监控或真实通知已送达。

本次发布保持财务记录摘要与金额、专用应用账号、89张表及42项迁移、非版本环境配置、原备份和对账脚本及日程；未执行迁移、数据库恢复或真实资金操作。HTTPS 证书到期为 2026-12-22 21:44（北京时间），商户证书到期为 2028-08-01 08:39（北京时间）。同日读取实际 `nginx -T` 未发现 `limit_req/limit_conn` 指令，`certbot.timer` 为 enabled/active；本轮未修改 Nginx 或续期配置。

告警接收人、现有通知渠道、运维和财务的响应时限尚未指定。当前可把检查结果交给当班人，但不能声称已经持续监控或有人收到告警。交接时须明确 API/DB/COS/证书/磁盘/备份的运维负责人，以及对账失败、差异和逾期的财务复核人，再沿用既有渠道完成无真实资金的失败通知实收验证；接收人确认前不向外发送测试消息。

本地合成验证（不访问服务器、数据库或微信）：

```bash
node --experimental-vm-modules deploy/cloud-test/check-operations.test.mjs
node --experimental-vm-modules deploy/cloud-test/reconcile-wechat-bill.test.mjs
```
