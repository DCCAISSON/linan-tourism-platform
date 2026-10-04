# 部署

当前云端采用单服务器上的 systemd + Nginx，API 和管理后台已在 HTTPS 受控环境运行，具体见[云端部署说明](cloud-test/README.md)。真实密钥只进入受控环境文件或密钥管理，不提交到 Git；已部署不等同于全部业务验收通过。

本地 UAT 使用 `deploy/docker-compose.yml` 启动 MySQL、API 和管理后台。当前编排设置 `NODE_ENV=production`，开发身份头和模拟资金入口不可用；其中 MySQL 空 root 口令仅限隔离本地 UAT，不能照搬为云端生产配置。启动前在当前会话提供 `PERSON_DATA_ENCRYPTION_KEY_BASE64`（32 字节随机密钥的 Base64），并将 API 地址和后台来源指向本地，避免本地页面误连云端：

```powershell
$env:LINAN_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3300'
$env:LINAN_PUBLIC_ADMIN_ORIGIN = 'http://127.0.0.1:4174'
docker compose -f deploy/docker-compose.yml up -d --build
Invoke-WebRequest http://127.0.0.1:3300/health
Invoke-WebRequest http://127.0.0.1:4174
docker compose -f deploy/docker-compose.yml down
```

不要对已有验收库使用 `down -v`，也不要更换已有数据所用的加密密钥。回退时设置上一候选镜像标签后重新启动，并核对 `/health`、页面版本和数据库迁移状态。云端身份、支付及数据库凭据与本地 UAT 分开管理；新环境须单独核验账号、HTTPS、密钥、备份恢复和业务开放范围。
