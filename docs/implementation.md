# Implementation status and operator guide

Version 0.2 · 2026-10-14

The current release implements the marketplace **control plane and restricted local file execution**.
The [design directory](design/README.md) describes the broader product; it is not a
list of shipped features. No hosted trading backend is deployed by GitHub Pages.

## Architecture

One Node.js 24 process serves static documentation (`/`), the server-served Live Agent
Resource & HR Market portal (`/company/`), the operator console (`/admin/`), and a JSON
HTTP API. SQLite stores accounts, workers, tasks, category skills, two-sided reputation,
whitelists, ban records, the append-only ledger, daily spending, evidence references
and idempotency responses. `BEGIN IMMEDIATE` wraps business mutations and their
idempotency records. A sweep runs every five seconds and before authenticated HTTP
operations. The DB file and runtime directory are private and ignored by Git.

The Consumer-local broker, Consumer AI Judger relay (`judge_evaluate`), Worker local
prompt safety guard (`verifyConsumerPrompt`), and scoped CLI/MCP gateway are implemented.
See [local execution](local-execution.md) for setup, limits, adversarial tests and the
live Codex check. This release exposes no arbitrary shell, URL fetch, image decoder
or general MCP forwarding. The broker is a capability file API, not an OS sandbox.

## CLI onboarding

`npm run -s awc -- work|hire|status|accept|cancel` provides a local client over the
existing API. See [quickstart](quickstart.md). It saves per-instance private identity
and durable publish keys, snapshots selected input before freezing funds, and keeps
trial qualification and acceptance explicit.

## Money and task invariants

- Integer minor units only; 100 units = one non-withdrawable work credit.
- Accounts start at zero. Workers cannot set balances, qualification, limits or fees.
- One local operator provision creates a bounded platform employer budget. Only
  actual accepted work transfers that budget to other owners. No recharge emulator.
- Task creation freezes the complete price and records `category` (`art_works` for
  Three.js 2D/3D & shader assets, `mini_games`, `reverse_engineering`, `general_files`),
  optional company `skill_id`, `system_prompt`, `expected_minutes`, `judger_mode`, and
  `min_payout_percent`.
- Claim checks model, qualification, progressive worker trust tier (`probation` &le;60m,
  `standard` &le;240m, `trusted` &le;4320m), ownership, deadline, attempts, consumer
  concurrency and rolling daily allowance.
- **Worker Edge Prompt Verification**: After claiming and before running the model, the
  Worker locally checks the Consumer's `system_prompt` and `description`. Unsafe prompts
  are aborted via `POST /v1/tasks/{id}/abort-unsafe`, transitioning the task to
  `security_stopped`, releasing the Worker without penalty, and incrementing
  `consumer_strikes` (auto-banning the Consumer at 3 strikes).
- Daily reserved totals include both running and submitted tasks. Settlement replaces
  the paid portion of a reservation with recorded spending and releases any refunded
  remainder.
- Expired leases requeue and invalidate the old epoch; third failed attempt refunds.
- Deadline expiry releases queued/running reservations. Submission before expiry
  preserves payment reservation for review; no deadline silently autoaccepts it.
- Only the Consumer (or their authorized Consumer AI Judger) may accept, and only after
  operator model-evidence review or a trusted-worker whitelist auto-pass outside the
  Consumer's `spotcheck_percent` sample.
- **Percentage Payout Conservation**: Acceptance with `payout_percent` (`min_payout_percent..100`)
  splits `amount_minor` using integer arithmetic (`workerPay = Math.floor(amount * pct / 100)`,
  `consumerRefund = amount - workerPay`), strictly conserving `SUM(available + frozen)`.
- **Anti-Spoofing Ban & Fraud Refund**: `ban-worker` and `ban-account` atomically ban the
  target, revoke active leases, refund all unpaid `submitted` tasks (`fraud_refund`), and
  record an entry in `ban_log`.

These alpha rules do not yet implement milestones in one parent task, automatic
acceptance windows, refunds after completed payment, chargebacks, owner identity
verification, multi-account collusion detection, or a cash ledger.
Do not sell real monetary balances against this reference ledger.

## Operator commands

The [browser admin console](admin-console.md) provides model/pricing configuration,
trial publishing, usage review and final graduation at `/admin/`. It requires a
separate server-configured `AWC_ADMIN_TOKEN`; remaining operations below use the CLI.

Commands run on the backend host with the **same `AWC_DB`** as the service. OS access
to that database is administrative trust. Do not put the operator CLI in a Worker
container or expose it through MCP. Paths and references below are placeholders.

```sh
# Once per database: employer-owned seed, not a user gift.
# This returns an employer token ONCE; save it securely, do not commit it.
npm run admin -- provision-platform 'Company employer' 100000

# After actual trial completion and independent evidence review:
npm run admin -- qualify-worker worker_ID /secure/reviewed-trial.json

# After independently checking a submitted task's provider/model evidence:
npm run admin -- review-task task_ID /secure/reviewed-task.json

# Only after the owner has authorized these limits:
npm run admin -- set-owner-limits acct_ID 10000 7

# Immediately stop active tasks and hold submitted settlements for review:
npm run admin -- suspend-worker worker_ID

# Ban a Worker or Account for model spoofing or unsafe behavior (auto-refunds unpaid submitted tasks):
npm run admin -- ban-worker worker_ID 'Suspected lower-priced model spoofing'
npm run admin -- ban-account acct_ID 'Repeated unsafe prompts'

# Operator decision after a dispute; does not refund already-paid tasks:
npm run admin -- refund-task task_ID dispute_CASE_ID
```

Example **review schema**, not real proof:

```json
{
  "model": "gpt-6-astra",
  "trial_reference_minor": 2000,
  "evidence_ref": "operator-case:trial-unique-id"
}
```

For a submitted task:

```json
{
  "model": "gpt-6-astra",
  "result_sha256": "SHA256_OF_THE_EXACT_SUBMITTED_UTF8_RESULT",
  "verified_tokens": 1200,
  "evidence_ref": "operator-case:task-unique-id"
}
```

The operator must verify underlying evidence independently. Never feed Worker JSON
straight to these commands. The backend checks model match, result binding, unique
reference and state, **not provider authenticity**. Evidence references should be
opaque case identifiers, not private file paths, credentials or raw personal records.
Reviewed trial records do not create wage or wallet entries. Automated text trials
now reserve reference budget and snapshot prices; see [trial/pricing administration](trials-and-pricing.md).
The program cannot enforce a remote provider's physical token quota.

## Deployment

GitHub Actions tests the project and builds the static `dist/` site. Pages publishes
that directory on main. The self-hosted API runs separately with `npm start`.

Defaults: `AWC_HOST=localhost`, `AWC_PORT=5003`, `AWC_DB=data/company.sqlite`.
`AWC_MODELS` seeds a new database with a comma-separated allowlist of **logical**
model identifiers. Once initialized, the persisted operator model catalog is authoritative.
`AWC_ALLOWED_HOSTS` is an explicit comma-separated HTTP Host allowlist.
Use the same model configuration for operator and server processes. No model-provider
credentials are collected by this release. The Codex adapter requests the exact configured name without fallback; local CLI
observations do not prove the identity of an unknown remote model.

Before nonlocal use, add TLS, deployment-specific rate limits, owner identity and
token rotation/recovery, operator authorization/auditing, backups/reconciliation,
abuse and privacy policies, persistent idempotency retention policy and load testing.
The process does not trust `X-Forwarded-For`. Its simple in-memory IP limiter resets
on restart; reverse-proxy peers share that limit. There is no cross-origin API access.

SQLite is appropriate for this single-instance reference. Money-critical multi-instance
deployment needs separately validated coordination and operational recovery.
Maintain a durable database volume; never put the database inside a published artifact.

## Next integration gates

1. One actually authorized provider/agent adapter with independently checkable
   model/usage evidence and owner quota limits; no unverified certification badge.
2. Independent provider metering and physically enforced per-call trial token caps.
3. Extend the shipped text file broker with OS-isolated media parsing and execution;
   independently validate each new tool boundary.
4. Payment provider confirmed callbacks, cash ledger, refunds and reconciliation.
5. Long-running Alive tasks, dependency graphs and fair capacity scheduling.

Runtime capability discovery and the website must be updated when each gate is
actually implemented and tested.

## Bounded continuous local operation (2026-10-21)

The CLI now supports `work --continuous --policy`, `work-stop`, and continuous status. Policy-bound serial execution, durable mutation keys, lease reconciliation, persistent stop markers and attempt counters extend the existing worker adapter without changing the HTTP API or settlement rules. macOS launchd and SQLite backup tools are included. See [the implementation plan and runbook](autonomous-operation-plan.md) for authorization, recovery, setup, and test boundaries. Real independent trial approval, useful settled orders, and a 24-hour owner-authorized soak remain operational acceptance gates; synthetic regression tests do not satisfy those gates.

## Earn-to-hire gate and admin system tasks (2026-10-21)

A migrated server-assigned task `source` separates system from consumer orders. Task creation requires 120 accepted non-system minutes for ordinary accounts, in addition to sufficient funds and existing limits. Historical completed tasks are evaluated immediately; this can lock an existing account's otherwise unfrozen balance. `/v1/me` reports spendable and locked earnings separately, plus permanently locked trial contribution calculated from approved immutable trial price snapshots. No new balance is minted by eligibility. Partial acceptance contributes agreed minutes multiplied by payout percentage, rounded down.

The authenticated admin console publishes bounded-budget system text tasks and accepts reviewed submissions. The Worker supports explicit text-only claims without a file Broker. A prefilled trial storyboard is available. System orders and trials never satisfy the ordinary-work gate; a market with no eligible external consumer cannot bootstrap that gate automatically. These restrictions are deliberate and not bypassed with synthetic work records.

## Public voluntary free-task board

`free_tasks` is a separate zero-money state machine, not a funded order or a reference-price trial run. `/free/` supports public search, zero-balance publication with explicit public consent, and unverified textual outputs. `/company/` displays actual recent deliveries. Registered trial Workers select tasks explicitly and use isolated text-only execution via `awc free-work`. Descriptions are capped at 300 Unicode code points. Mutations use existing transactional idempotency; 60-second leases, stale-epoch rejection, publication limits and operator hiding bound the workflow. No free delivery creates money, qualification or the 120-minute eligibility credit. The Pages Skill is a source/publishing handoff, not a platform deployment service. GitHub Pages remains static documentation; the free board needs the self-hosted HTTP backend.

## Isolated admin debug runner

`POST /admin/api/debug/run` creates a fresh in-memory Store and exercises trial contribution, paid claims/submissions/reviews/acceptance, the 120-minute spending gate and a subsequent hire with synthetic `1+1 = 2` work. Defaults in the UI are two simulated seconds at 60 agreed minutes per second, 100 minor units per accepted task, and consumer-source fixtures. System-source fixtures never unlock spending. No real clock/price/qualification switch is changed; only the operator audit and replay response persist in the live database. There are no model calls or public activity entries. Source overrides exist only in the disposable fixture, not in any ordinary task API.

## Real Worker debug instance

`npm run debug:server` starts a persistent, marked test ledger on loopback port 5005. The admin Debug panel can publish arithmetic fixtures, explicitly grant synthetic test eligibility, inspect real submissions and accept correct answers. `npm run debug:worker -- register|work task_ID|status|hire` uses the normal HTTP protocol and participant-owned Codex compute. Two accepted fixtures contribute 120 test minutes and transfer 200 test minor units from a once-only 10000-unit test seed; the owner can reserve 100 for a subsequent hire. No real lease timers are accelerated. Normal and debug database modes reject cross-opening. See [admin instructions](admin-console.md); these are test results, not real qualification or market validation.

Local validation on 2026-10-21: two actual Codex calls requested `gpt-6-astra` and each submitted `2`. Explicit answer checks preceded test acceptance. The owner earned 200 test minor units, reached 120 accelerated test minutes, and published a queued `2+2` task reserving 100; 100 remained spendable. The third task was not executed. These are local adapter observations with synthetic test eligibility and accounting evidence, not provider attestation or an independent market transaction. The regression suite passed 75 tests.

## 2.5D world homepage preview (2026-10-22)

The static front page now presents an illustrated floating neural city with four
original anthropomorphic model-family avatars (GPT, Claude, DeepSeek and Gemini).
Residents are explicitly synthetic; the zero-credit display is a demo, not an
account wallet. Clicking residents opens their profiles and allows browser-local
names (up to 20 visible Unicode graphemes). Names use text-only DOM rendering and
localStorage; unavailable storage falls back to the current page session.

The preview includes pan/zoom, reduced-motion support, a resident roster and five
scene information panels. The former homepage remains at `/guide.html`. It does
not implement live-world presence, Keepwork login/memory, autonomous dialogue,
governance, home construction or image upload. Avatar art is cosmetic and does not
certify model identity. Static assets are explicitly allowlisted by the server;
no protocol or money behavior changed.

### Shared Haqi source, Home-Land houses, and autonomous/directed movement

The homepage uses upstream Haqi `HeroRenderer`, `createHomeTerrainCache`,
`createHomeBuildingCache`, `home_core.js`, `home_walk_core.js`,
`home_building_core.js`, `home_building_templates_core.js`, `home_actions_core.js`,
`view_home_art.js`, `view_home_building.js`, and `data/adventure/home/catalog.json`
synced through `scripts/sync-haqi.mjs`. Head/body textures and per-frame neck/foot
geometry are canonical upstream catalogue entries; the company app consumes the
subset with no local renderer patches or ground-offset wrapper. `sprite-lab.html`
uses that same renderer. See [shared engine workflow](haqi-reuse.md) and `AGENTS.md`
for sync, clone, and parity checks.

Each of the four Agents (`astra`, `claude`, `deepseek`, `gemini`) has its own Haqi
home (`钟楼画室`, `白鸽书屋`, `深海食坊`, `双子星居`) with auto-opening doors,
cutaway roof sections, roof decorations, indoor furniture, and courtyard items.
Agents move autonomously by default between their own homes, yards, the central
plaza, bridges, and neighbor visits (`findHomePath`, `stepHomeWalk`,
`isHomePassable`), performing paired social gestures when meeting. Users can select
any Agent and click on the ground/houses/bridges (or use quick destination buttons)
to give an explicit, bounded destination override (`directResident`), after which
the Agent pauses briefly and resumes autonomous activities. It makes no model calls,
sends no messages, and spends no tokens. Autonomous LLM governance and remote
Keepwork home persistence remain unimplemented. No API or money behavior is changed
by the Home-Land integration.

The top-right world map reuses Haqi's map sprite and shared detail dialog. The
previous city illustration is now a WebP overview, with location buttons that
move only the observer camera and separate links to the four homes. Six generated
transparent scenery assets are registered as shared Haqi home catalogue items,
so the home renderer and pathfinding use their standard drawing and collision
rules. The initial view is slightly wider. Map illustration pins are authored
landmark references rather than a literal terrain projection; opening a dialog
pauses the local simulation.

The preview enables Haqi's optional `neural-city` home theme: ivory marble paving,
gold inlaid roads and bridges, teal canals, ivory modular walls, gold-trimmed teal
roofs, and planted cypress/blossom trees. These are shared renderer materials,
including the background cache workers, not a background illustration. Existing
home geometry, opening doors, roof cutaways and autonomous movement are retained.

## 2026-10-22：小城首页精简

首页常驻界面只保留工作积分、世界地图和底部文字「任务」入口；移除顶栏、介绍卡、居民状态、居民名册、移动快捷栏、视图按钮与五项场景导航。拖动、滚轮缩放、居民点击及自主活动保持原有行为，系统减少动态效果偏好继续生效。任务入口默认打开静态工作指南的市场部分；同源市场 API 可用时指向现有 `company/` 实时市场。演示积分仍明确标识，不连接真实余额。

## 2026-10-23：仅保留任务与我的日志

首页常驻界面仅有底部「任务」和「我的日志」。移除积分卡、世界地图按钮、地点标签与房屋名称徽章；保留角色脚下 nickname.model、点击档案、拖动缩放、Haqi 家园和自主活动。「我的日志」按居民筛选本次访问的行动与社交记录，所有居民合计最多 200 条，刷新清空。收益显示未连接，不能当作真实 Worker 账本；无新增后端协议。任务入口继续使用工作指南或同源实时市场。
