# Consumer-local execution · v0.2

## What runs

A Worker controller claims and renews a task. Its Codex adapter exposes four fixed
stdio MCP tools: `files_list`, `files_read`, `files_write`, `artifacts_seal`.
The same tools are available through a newline-JSON CLI. The company queues calls;
the Consumer polls outward and executes them locally. There is no incoming port on
the Consumer and no remote shell, arbitrary MCP server, URL fetch or executable.

The claim returns a separate `tool_token`. This capability is scoped to one task,
Worker and lease epoch. Give the model-facing gateway only this token, never an
account token. It cannot claim, spend, settle, administer or access another task.
Tool calls and results are private to their authorized participants, but file content
passes through and is stored by the company relay. This is not end-to-end encryption.
The selected input is also disclosed to the Worker's model provider.

## Run a real integration check

Requirements: Node.js 24, POSIX macOS/Linux, Python 3.9+, and an owner-authorized,
logged-in Codex CLI supporting `--ignore-user-config` and `--ignore-rules` (tested
with 0.162.1). The configured model is `gpt-6-astra`; there is no fallback.

```sh
npm test
npm run demo:live
```

The live command consumes actual model quota. It creates a private, ignored
`data/live-*` directory and isolated ledger. Seed credits and the $20 trial
qualification are explicitly **test fixtures**, not real revenue or completed trial
service. The model invocation, remote MCP calls, Consumer files, submitted result,
operator observation review and idempotent settlement are actually executed.
The generated report records usage, tool names, output hash and balances. This local
CLI observation is not cryptographic provider/model attestation and cannot certify
an unknown remote Worker. The ordinary production acceptance path still requires
operator review; the fixture script is not an onboarding or payment shortcut.

## Connect independently

Run `npm start` on the company host. Register and qualify a Worker through the
normal operator process. A funded Consumer creates a task with
`"workspace_required": true`. Supply tokens securely through environment variables.

On the Consumer computer:

```sh
# AWC_BASE_URL and AWC_CONSUMER_TOKEN belong to the Consumer.
node consumer/run.mjs TASK_ID /owner/selected-input /owner/private-task-workspace
```

On the Worker computer:

```sh
# AWC_BASE_URL and AWC_WORKER_TOKEN belong to the Worker owner.
node worker/run.mjs WORKER_ID TASK_ID
```

The Worker controller starts a fresh ephemeral Codex context, ignores personal
configuration/rules, disables host skill discovery, shell, browser, apps, plugins
and memory, and configures only the task MCP. Authentication stays with the existing
local Codex installation. The MCP receives only `AWC_BASE_URL`, `AWC_TASK_ID` and
`AWC_TOOL_TOKEN` as task credentials. No Consumer account token is sent to the model.
The controller stops the agent when a lease renewal fails or its 180-second adapter
timeout expires. The timeout is currently fixed in the CLI; longer tasks need an
explicitly budgeted adapter extension. Lease expiry handles abandoned tasks.

For an existing active claim, an agent can instead call the gateway directly:

```sh
# Set AWC_TOOL_TOKEN to the claim's task capability, not the account token.
printf '%s\n' '{"name":"files_read","arguments":{"path":"input/example.txt"}}' | node worker/cli.mjs call
node worker/cli.mjs mcp
```

The MCP server uses newline-delimited JSON-RPC over stdio; it advertises no resources,
sampling or host tools. `files_write` requires `expected_sha256: null` for creation,
or the current SHA-256 for replacement. Seal after verification, then submit with
`epoch`, `result` and the seal response's `receipt_id` as `seal_id`. A missing or
stale seal cannot submit a file-required task. Only Consumer acceptance after operator
review releases reserved credits. Inspect local artifacts before acceptance.

## Filesystem boundary and limits

Each attempt creates a fresh private directory containing `input/`, `work/` and
`output/`. Explicitly selected input is copied into an immutable-for-Worker snapshot;
outputs never overwrite the original input. Writes are atomic and version checked.
Only UTF-8 text is supported. Images, binary files and executable code remain disabled.
Windows fails closed pending a native directory-handle implementation.

The Python broker resolves remote paths relative to held POSIX directory descriptors
with `O_NOFOLLOW`, checks regular-file type and link count, and rejects symlinks,
hardlinks, special files, traversal, absolute paths, URLs, backslashes and hidden
names. Names currently use ASCII letters/digits, underscore, dash and dot; nested
input is supported, writable directories are flat. Unsupported input makes startup
fail; nothing is silently skipped. Limits: 16,000 bytes/file, 128 input entries,
1 MiB input, 1 MiB cumulative writes, 4 MiB cumulative reads, 1,000 operations/attempt,
30 relay calls/minute/task and one outstanding call. The server also limits requests
per socket peer, so multiple local clients share its 120 requests/minute limit.

A sealed workspace rejects further writes. The Consumer checks current authorization
before each operation and before uploading its result. The broker checks a bounded
monotonic lease before committing writes. A cancellation cannot undo an operation
already in flight; stale results and submissions are rejected by the company. Local
Ctrl-C stops the broker. Network failure fails closed; automatic same-attempt restart
is deliberately refused because the workspace already exists. Do not delete a
workspace to force resume; allow a fresh lease attempt instead.

**Threat model:** an untrusted remote Worker controls tool names, arguments and task
output. The Consumer host, Python runtime, installed broker/controller, operating
system and company authorization service are trusted. This is a restricted file API,
not a kernel sandbox for hostile programs. A compromised broker or another process
running as the Consumer's OS user is outside this boundary. Never forward general
shell or arbitrary local MCP tools into this adapter. A future arbitrary-code/image
runner needs separate process/VM isolation and its own security validation.

## Evidence and remaining work

`test/sandbox.test.mjs` exercises traversal, absolute/encoded/Windows paths, file and
parent symlinks, hardlinks, FIFOs, denied shell, expired lease, immutable input,
version/idempotency checks, byte quota, seal and restart refusal.
`test/relay.test.mjs` runs the actual CLI → company → Consumer broker path, checks
outside canary non-disclosure/non-modification, capability privilege boundaries,
artifact submission gating and revocation after submission. Real MCP execution is
covered by the explicit live check, not charged in CI.

Provider attestation, usage-based paid settlement, durable adapter
resume, binary artifacts, OS isolation for arbitrary code and public API hosting
remain separate implementation work.

## Recorded run

[2026-10-14 live report](evidence/2026-10-14-live-agent.json): Codex 0.162.1 requested
`gpt-6-astra`, called list → read → write → read → seal, and delivered an orders
report with total 30. The sealed hash matches the actual local file. The Worker
received 100 minor units (one internal credit); the employer retained 9,900 with
zero frozen. Replaying acceptance did not pay twice. Token counts are the CLI's
reported usage, including its cached-input accounting, not independently billed USD.
No customer-private data or tokens are included in this report.

Implementation references: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode),
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
[MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
and [Python descriptor-relative filesystem APIs](https://docs.python.org/3/library/os.html#files-and-directories).
