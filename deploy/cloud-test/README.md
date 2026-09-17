# 云端测试部署

此目录用于已备案域名下的受密码保护的测试环境。当前应用使用模拟家庭/员工身份及模拟支付，不用于真实家长报名或真实收款。

运行环境为 Ubuntu 22.04、Node 22.23.2、工作区锁定版本 pnpm、Nginx 和 systemd。业务数据连接独立云数据库 `linan_platform_test`，附件使用测试 COS 桶。

- 程序位置：`/opt/linan-test/app`。
- 私有 API 配置：`/etc/linan-test/api.env`，root 所有、权限 600；由 systemd 加载。至少配置 `DATABASE_URL`、`NODE_ENV=development`、`HOST=127.0.0.1`、`PORT=3000`、`ADMIN_WEB_ORIGIN=https://admin.linantravel.cn`；COS 配置参照根目录 `.env.example`。密码和密钥不得提交到仓库。
- 后台构建时设置 `VITE_API_BASE_URL=/api`，后台 API 请求使用同源 Nginx 代理。
- 初始化仅执行迁移，不启用 TypeORM synchronize；执行前确认指定测试库没有真实业务数据。演示价格为 128 元/人，使用虚拟学校和家庭。
- `linan-test-api.service` 安装到 `/etc/systemd/system/`，执行 `systemctl daemon-reload` 和 `systemctl enable --now linan-test-api`。
- 先启用 `nginx-http.conf`，通过 `/var/www/linan-acme` webroot 为两个域名申请名称为 `linan-test` 的证书，再同时启用 HTTP 和 HTTPS 配置。
- HTTPS 使用 `/etc/nginx/linan-test.htpasswd` 保护后台和 API。HTTP 仅提供 ACME 校验与 HTTPS 跳转；API 只监听服务器回环地址。
- Certbot 定时续期；将 `renew-nginx.sh` 安装为 root 所有、权限 750 的 `/etc/letsencrypt/renewal-hooks/deploy/linan-nginx.sh`，成功续期后检查并重新加载 Nginx。

以下为公网开放前必须满足的验收条件：无密码返回 401；有效密码可打开后台并访问健康检查；后台能创建配置、查询和导出已付款名单；模拟报名/支付与按取消人数计算退款；API 崩溃后自动恢复；服务已设置开机启动；两个域名证书均有效。正式微信身份、真实支付及退款审批仍需单独完成后才能开放真实业务。

2026-09-17 实际进度：云端程序构建、独立空测试库的 5 项迁移（17 张表）、API/systemd 自动恢复及开机启动已完成。通过 SSH 加密隧道访问服务器回环 Nginx，实际浏览器建校、名单查询及 Excel 下载通过；虚拟两人订单为 256 元，取消一人的退款试算为 128 元，模拟退款不执行结算、不修改名单。

公网 HTTPS 尚未完成：证书 HTTP 校验被腾讯云备案提示页拦截，公开备案状态接口返回 `GovStatus=false`、`LandedStatus=false`。须核对该域名的 ICP 备案和腾讯云接入状态，解除平台拦截后再申请证书并启用 HTTPS 配置；在此之前两个公网入口不构成可用交付。内部 QA 站点仅监听 `127.0.0.1:8080`，API 仅监听 `127.0.0.1:3000`，没有新增公网业务端口。
