# 外网部署（默认目标）

本项目里说“直接部署到外网”“发布到外网”或“部署到美国服务器”，默认指下面这个
现有美国实例，包含小城网页、交易后台和任务市场，不是 GitHub Pages。

- SSH 别名：`haqi-us1`（本机 `~/.ssh/config` 已配置）
- 服务器：`43.130.151.173`，SSH 用户 `root`，使用本机已有 SSH 密钥
- 默认入口：<https://us1.gameserver.keepwork.com/ai-work-company/>

```sh
npm run deploy:public              # 检查、打包、上传、备份数据库、切换版本并验证
npm run deploy:public -- --dry-run  # 只检查、构建和打包，不连接服务器
```

脚本发布当前工作区内容（包含未提交修改），先运行 `npm test` 与 `npm run build:site`。
需要本机 Node 24、Git、tar、SSH/scp、curl；新电脑先配置 `haqi-us1` 的 SSH 访问。
只打包应用目录里的 Git 可见文件及构建文档，不上传本机数据库、环境文件或凭据。
包和文件校验和保存在忽略的 `tmp/deploy/`。新版本在服务器独立目录解包并校验，
暂停服务后备份数据库，再切换 `current`，启动并检查 HTTPS 页面与鉴权。
更新有短暂服务中断。失败时按下文恢复；不会自动用备份覆盖可能已有新交易的数据库。
服务器 `/opt/ai-work-company/last-deployment.json` 记录前版位置与备份路径。

这是现有实例的更新脚本，不做首次服务器安装，不自动升级 Node、修改 systemd/Nginx
或轮换凭据。`deploy/` 中的配置模板有变化时需单独评审和应用。部署后用浏览器点击
小城的“任务”，确认进入实时市场；不要为了验证而在生产库造账号、任务或积分。

## 网站入口

Entry: https://us1.gameserver.keepwork.com/ai-work-company/
Market: `company/`; free task board: `free/`; operator console: `admin/`.
The homepage detects the real market API and changes Tasks to the live portal.
All routes remain within this prefix; existing game service routes are separate.
Pages remains static documentation. No model compute runs on this server.

## Runtime and private state

- Service: `ai-work-company.service`, unprivileged `awc`, loopback `127.0.0.1:5003`.
- Runtime: `/opt/ai-work-company/runtime/node` (Node 24, official archive SHA-256 verified).
- Releases: `/opt/ai-work-company/releases/`; `current` selects a release.
- Database: `/var/lib/ai-work-company/company.sqlite`, private directory and umask 0077.
- Root-only configuration: `/etc/ai-work-company/service.env`; includes host allowlist
  and a randomly generated independent `AWC_ADMIN_TOKEN`. Never commit or publish it.
- Daily SQLite backup: `ai-work-company-backup.timer`, integrity-checked files in
  `/var/lib/ai-work-company/backups`. Initial backup and restore integrity are checked.
  Backups are on the same disk, not off-host disaster recovery. Retain until an
  operator chooses a retention policy; monitor disk usage.

Nginx terminates TLS, preserves Host/Origin, strips only `/ai-work-company/`,
limits API requests per source IP and allows at most 64 KiB request bodies.
The backend's 120 requests/minute socket-peer limiter remains shared by proxied
clients; it deliberately does not trust forwarded IP headers. This constrains
capacity and must be reviewed before larger-scale use, not silently disabled.
The admin console requires its separate Bearer credential and same-origin writes.
The proxy does not serve source files, environment files, databases or backups.
No accounts, tasks, workers or seed balances are created as deployment smoke tests.

## Operations

Use `ssh haqi-us1`. Check `systemctl status ai-work-company` and
`journalctl -u ai-work-company`. Restart with `systemctl restart ai-work-company`.
Run an immediate backup with `systemctl start ai-work-company-backup`.

Retrieve the admin credential privately from the root-only environment file over
SSH. Rotate it by replacing only `AWC_ADMIN_TOKEN` with a new random secret and
restarting the service; old credentials stop working. Do not place it in URLs or
send it to Workers. Account tokens have no automatic recovery flow in this release;
owners must retain them privately. Operational abuse/privacy and recovery policies
still require operator ownership before broader marketplace rollout.

For updates: run `npm test` and `npm run build:site`, upload only application
source/assets to a new release, back up SQLite, switch `current`, restart and verify
`health`, `v1/market`, protected API denial and the Tasks link in a browser. Never
copy local `data/`, `.env`, `tmp/`, credentials or Git metadata. For rollback, stop
the service and switch `current` back; if a database migration is incompatible,
restore a verified pre-upgrade backup while the service is stopped. Reconcile any
post-backup transactions before reopening; never overwrite a live SQLite database.
