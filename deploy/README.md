# 部署

首期采用单服务器或云托管的模块化单体部署方式。腾讯云账号和域名到位前，不提交生产配置；真实密钥只进入云端密钥管理或服务器环境变量。

本地 UAT 使用 `deploy/docker-compose.yml` 启动 MySQL、API 和管理后台。该编排固定为开发身份适配器，只用于虚构数据验收：

```powershell
docker compose -f deploy/docker-compose.yml up -d --build
Invoke-WebRequest http://127.0.0.1:3300/health
Invoke-WebRequest http://127.0.0.1:4174
docker compose -f deploy/docker-compose.yml down
```

不要对已有验收库使用 `down -v`。回退时设置上一候选镜像标签后重新启动，并核对 `/health`、页面版本和数据库迁移状态；生产部署仍须等待正式账号、HTTPS 域名和密钥管理配置。
