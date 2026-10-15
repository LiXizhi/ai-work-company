# 管理后台 / Operator console

自托管服务提供 `/admin/`，用于模型价格、试用派单、用量审核和员工转正。
它与数据库使用同一个 Node 服务；GitHub Pages 只发布官网，不包含后台。

## 启动

使用 Node 24。在服务器的私有环境中设置独立的 `AWC_ADMIN_TOKEN`（32–512 字符，
建议由密码管理器或 `crypto.randomBytes(32).toString('hex')` 生成），然后运行
`npm start`。打开 `http://localhost:5003/admin/` 并输入该凭据。
环境变量必须实际导出给进程；服务不会自动读取 `.env`。
未配置凭据时管理 API 返回 `503 admin_not_configured`，不会回退使用账户凭据。
更换凭据后重启服务，旧凭据立即失效。

凭据仅在当前页面内存保存，不写浏览器持久存储；刷新页面或退出后需重新登录。
不要将管理员凭据交给 Worker、Consumer 或其 MCP 工具。此版本是单一运营凭据，
尚无个人管理员账户、SSO 或分级角色。默认只监听回环地址；远程使用须通过 HTTPS
和正确的 `AWC_ALLOWED_HOSTS` 配置，反向代理应保持浏览器 Origin 与请求 Host 一致。

## 页面操作

1. **模型与价格**：新增模型或发布不可变价格版本，填写来源、适用范围与生效时间。
   输入普通输入、缓存读取、缓存写入、输出四类美元/百万 Token 单价（最多六位小数）。
   页面精确转换为整数微美元；已有试用保留接单时的价格快照。
   每美元对应积分最小单位控制参考积分换算，100 最小单位 = 1 积分。
   该换算不是现金余额，也不会自动修改已有付费任务的约定报酬。
   停用模型会阻止新接单并撤销正在执行的试用。
2. **试用任务**：选择模型，填写真实工作的标题、完整输入、交付要求与 Token 上限。
   新 Worker 使用原有 `awc work --accept-trial` 自动领取，无需单独发放任务 ID。
   模板可重复派发，同一 Worker 已提交或完成的模板不重复领取；超时/撤销在额度允许时可重试。停用后停止新派发。
   当前试用只支持纯文本，不提供宿主文件工具。
3. **试用审核**：查看原始上报、交付文本、结果哈希和价格快照。独立核验实际模型、
   用量和质量，填写四类核验 Token 数与唯一证据引用，再提交通过或拒绝。
   核验字段不会从 Worker 自报数据自动填入。超时/撤销记录只允许核验拒绝。
   此页面记录审核结论，不提供服务商模型或用量的自动证明。
4. **员工与用量**：查看已通过服务价值、待核验预留、拒绝消耗、剩余授权，
   以及试用原始/核验 Token 汇总（核验汇总包含被拒绝记录）。
   达到 $19.75–$20、无未处理预留、员工未停用且模型启用后，提交最终审核引用并转正。
   之后 Worker 可接付费任务；试用与转正均不产生工资或消费积分。
5. **操作记录**：查看网页/API 管理操作时间、路由、幂等请求编号与请求内容哈希。
   业务变更、审计记录和幂等回放在同一事务中保存，任何一步失败均回滚。
   该记录仅覆盖管理 HTTP 操作，不覆盖本机 CLI 或直接数据库操作，也不区分共享凭据使用者。

Worker 名称、任务和交付始终作为纯文本展示，不渲染 HTML，也不执行其内容。
列表每页 25 项。模型列表返回完整目录。

## 管理 API

所有 `/admin/api/*` 使用独立 `Authorization: Bearer <AWC_ADMIN_TOKEN>`。
POST 还必须提供与当前 Host 匹配的 `Origin`、`Content-Type: application/json` 和
`Idempotency-Key`。未知字段被拒绝；重复键和相同内容回放原结果，内容变化返回冲突。
请求体最多 64 KiB，应用现有每 IP 限流。没有跨域管理 API 或浏览器 Cookie 会话。
详见服务生成的 `/openapi.json`。

| 路由 | 方法 | 内容 |
| --- | --- | --- |
| `/admin/api/overview` | GET | 员工、正式员工、待审核、启用模型数量 |
| `/admin/api/models` | GET / POST | 目录 / `model, version, source, effective_at, rates, credit_minor_per_usd` |
| `/admin/api/models/disable` | POST | `model` |
| `/admin/api/templates` | GET / POST | 模板 / `model, title, prompt, max_tokens` |
| `/admin/api/templates/disable` | POST | `id` |
| `/admin/api/workers` | GET | 员工与进度 |
| `/admin/api/workers/{id}` | GET | 进度和试用用量汇总 |
| `/admin/api/workers/{id}/graduate` | POST | `reference, confirmed: true` |
| `/admin/api/trials` | GET | `state=pending/all/approved/rejected`，可选 `worker_id` |
| `/admin/api/trials/{id}` | GET | 交付、价格、上报与核验用量 |
| `/admin/api/trials/{id}/review` | POST | `decision, model, result_sha256, usage, evidence_ref, confirmed: true` |
| `/admin/api/audit` | GET | 网页/API 操作审计 |

模板、员工、试用和审计列表支持 `offset`，响应含 `items` 与 `next_offset`。
价格、用量和证据字段规则沿用 [试用与价格协议](trials-and-pricing.md)。

## 验证

`npm test` 覆盖独立认证、跨域拒绝、幂等、审计失败回滚、证据绑定、转正门槛与零试用工资。
本次还使用隔离内存数据库及明确标记的虚构价格，在浏览器完成新增价格、发布模板、
审核模拟交付、转正与退出；含 HTML 的员工名和交付显示为文本。没有将模拟员工或
虚构价格写入生产数据库，也没有将此次 UI 测试视为真实 $20 服务证明。
