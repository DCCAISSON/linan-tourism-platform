# 云端测试部署

本目录用于已备案域名下的受保护测试环境。当前环境只用于需求方点选和内部验收，使用虚构学校、家庭、人员、车辆和模拟支付数据；不得接入真实报名、真实收款、真实退款或图片直播生产数据。

## 运行结构

- 程序目录：`/opt/linan-test/app`。
- API 进程：`linan-test-api.service`，由 systemd 管理，工作目录为 `/opt/linan-test/app/apps/api`。
- API 只监听服务器回环地址，管理后台通过 Nginx 受保护入口访问；公网 HTTPS 未完成前，不开放正式交付入口。
- 业务库：云数据库测试库 `linan_platform_test`。
- 后台构建时使用 `VITE_API_BASE_URL=/api`，由同源 Nginx 转发 API。

## `/etc/linan-test/api.env` 必填项

该文件必须由服务器 root 持有，权限 `600`，不得提交到 Git。

```bash
DATABASE_URL=mysql://...
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
ADMIN_WEB_ORIGIN=http://127.0.0.1:8080
PERSON_DATA_ENCRYPTION_KEY_BASE64=<32-byte-random-base64>
REVISION=<deployed-git-sha>
```

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

- 当前迁移链路覆盖 10 个迁移文件，包含任务 2—6 的员工账号权限、告知书版本、名单导入、订单支付退款、车辆安排等表结构。
- 当前演示价格按 195 元/人，两人订单为 390 元；退款仍按取消人员数试算，不接真实退款结算。
- `GET /health` 必须返回 `revision`，其值必须等于本地最终提交和远端分支 HEAD。
- systemd 验收要求：`systemctl is-active linan-test-api` 和 `systemctl is-enabled linan-test-api` 均通过。
- 本次不启用公网 HTTPS、不接真实微信支付/退款、不接图片直播生产接口。

## 必验流程

1. 主账号登录，创建子账号，勾选权限和范围。
2. 子账号首次登录强制改密，禁用和重置后状态正确。
3. 三类名单模板导入成功；重复导入跳过；逐行错误可见；导入不改变订单和已付款统计。
4. 版本化告知书激活后，报名必须精确同意当前版本。
5. 车辆安排保存、容量刚好通过、超载失败、九列 Excel 导出。
6. 多人订单、模拟支付、按取消人数退款预览/模拟通过，模拟退款不结算、不修改名单。
7. 失败探针：缺加密 key、过期/禁用账号、错误 workbook、stale notice、车辆 overload、服务重启恢复。
