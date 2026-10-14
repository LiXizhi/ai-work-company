import { randomBytes, randomUUID } from 'node:crypto';
import { Fault, hash, string } from './store.mjs';

export const TOOL_NAMES = ['files_list', 'files_read', 'files_write', 'artifacts_seal'];
export const TOOLS = [
  { name: 'files_list', description: 'List ordinary files in this task only. Relative path: input, work or output.', inputSchema: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: { type: 'string' } } } },
  { name: 'files_read', description: 'Read a UTF-8 task file and its SHA-256 version. No host files, links, URLs or shell access.', inputSchema: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: { type: 'string' } } } },
  { name: 'files_write', description: 'Atomically write UTF-8 under work/ or output/. expected_sha256=null creates a new file; otherwise supply the version from files_read. input/ is read-only.', inputSchema: { type: 'object', additionalProperties: false, required: ['path', 'content', 'expected_sha256'], properties: { path: { type: 'string' }, content: { type: 'string', maxLength: 16000 }, expected_sha256: { type: ['string', 'null'] } } } },
  { name: 'artifacts_seal', description: 'Freeze output files and return a manifest receipt. Call after completing all writes. Further writes are denied.', inputSchema: { type: 'object', additionalProperties: false, properties: {} } },
].map((tool) => ({ ...tool, annotations: { readOnlyHint: ['files_list', 'files_read'].includes(tool.name), destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

function demand(ok, code, message, status = 409) { if (!ok) throw new Fault(status, code, message); }
export function initRelay(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS tool_caps (
    hash TEXT PRIMARY KEY, task TEXT NOT NULL REFERENCES tasks(id), worker TEXT NOT NULL, epoch INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY, task TEXT NOT NULL REFERENCES tasks(id), worker TEXT NOT NULL, epoch INTEGER NOT NULL,
    name TEXT NOT NULL, args TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', result TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS tool_calls_task ON tool_calls(task,created_at);
    CREATE TABLE IF NOT EXISTS task_workspaces (task TEXT PRIMARY KEY REFERENCES tasks(id), required INTEGER NOT NULL, seal_id TEXT);
  `);
}
export function mintToolCap(store, task) {
  const secret = `awct_${randomBytes(32).toString('base64url')}`;
  store.run('INSERT INTO tool_caps VALUES(?,?,?,?)', hash(secret), task.id, task.worker, task.epoch);
  return secret;
}
export function authorizeTool(store, secret, taskId) {
  const cap = store.one('SELECT * FROM tool_caps WHERE hash=? AND task=?', hash(secret || ''), taskId);
  demand(cap, 'invalid_capability', 'Task tool capability required.', 401);
  const task = store.one('SELECT * FROM tasks WHERE id=?', cap.task);
  const worker = store.one('SELECT * FROM workers WHERE id=?', cap.worker);
  demand(store.models.includes(task.model) && task.state === 'running' && task.epoch === cap.epoch && task.worker === cap.worker && !worker.suspended && task.lease_until > store.now() && task.deadline > store.now(), 'lease_expired', 'Task capability is stale or revoked.');
  return { cap, task };
}
export function enqueueTool(store, cap, name, args) {
  demand(TOOL_NAMES.includes(name), 'tool_not_allowed', 'Only the published task tools are allowed.', 400);
  const schema = TOOLS.find((tool) => tool.name === name).inputSchema;
  demand(args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).every((key) => key in schema.properties) && (schema.required || []).every((key) => key in args), 'invalid_arguments', 'Arguments do not match the tool schema.', 400);
  if (name !== 'artifacts_seal') string(args.path, 'path', 512);
  if (name === 'files_write') {
    demand(typeof args.content === 'string' && Buffer.byteLength(args.content) <= 16000, 'invalid_content', 'Maximum UTF-8 write is 16000 bytes.', 400);
    demand(args.expected_sha256 === null || (typeof args.expected_sha256 === 'string' && /^[a-f0-9]{64}$/.test(args.expected_sha256)), 'invalid_version', 'Use null or a SHA-256 version.', 400);
  }
  demand(!store.one("SELECT id FROM tool_calls WHERE task=? AND epoch=? AND state='pending'", cap.task, cap.epoch), 'tool_busy', 'Wait for the previous tool result.');
  const count = store.one('SELECT COUNT(*) AS n FROM tool_calls WHERE task=? AND created_at>?', cap.task, store.now() - 60000).n;
  demand(count < 30, 'tool_rate_limit', 'Task tools are limited to 30 requests per minute.', 429);
  demand(store.one('SELECT COUNT(*) AS n FROM tool_calls WHERE task=?', cap.task).n < 1000, 'tool_quota', 'Task tool request quota reached.');
  const id = `call_${randomUUID()}`;
  store.run('INSERT INTO tool_calls(id,task,worker,epoch,name,args,created_at) VALUES(?,?,?,?,?,?,?)', id, cap.task, cap.worker, cap.epoch, name, JSON.stringify(args), store.now());
  return { id, state: 'pending' };
}
export function pendingTools(store, owner, taskId) {
  const task = store.task(owner, taskId);
  demand(task.owner === owner, 'forbidden', 'Only the Consumer may retrieve execution requests.', 403);
  const calls = store.models.includes(task.model) && task.state === 'running' && task.lease_until > store.now()
    ? store.all("SELECT * FROM tool_calls WHERE task=? AND epoch=? AND worker=? AND state='pending' ORDER BY created_at", taskId, task.epoch, task.worker) : [];
  return { task, server_time: store.now(), calls: calls.map((call) => ({ ...call, args: JSON.parse(call.args) })) };
}
export function completeTool(store, owner, taskId, callId, result) {
  const task = store.task(owner, taskId);
  demand(task.owner === owner, 'forbidden', 'Only the Consumer may return execution results.', 403);
  const call = store.one('SELECT * FROM tool_calls WHERE id=? AND task=?', callId, taskId);
  demand(call && task.state === 'running' && call.epoch === task.epoch && call.worker === task.worker && task.lease_until > store.now() && task.deadline > store.now(), 'lease_expired', 'Result belongs to a stale attempt.');
  demand(result && typeof result === 'object' && !Array.isArray(result) && typeof result.ok === 'boolean' && Buffer.byteLength(JSON.stringify(result)) <= 48000, 'invalid_result', 'Invalid or oversized tool result.', 400);
  demand(call.state === 'pending', 'already_completed', 'Tool result was already recorded.');
  if (call.name === 'artifacts_seal' && result.ok) {
    demand(result.manifest && /^[a-f0-9]{64}$/.test(result.manifest.sha256) && Array.isArray(result.manifest.files) && result.manifest.files.length > 0, 'invalid_manifest', 'A nonempty output manifest is required.', 400);
  }
  store.run("UPDATE tool_calls SET state='done',result=? WHERE id=?", JSON.stringify(result), callId);
  return { id: callId, state: 'done' };
}
export function bindSubmission(store, taskId, body) {
  const workspace = store.one('SELECT * FROM task_workspaces WHERE task=?', taskId);
  if (!workspace?.required && !body.seal_id) return;
  const seal = store.one("SELECT * FROM tool_calls WHERE id=? AND task=? AND epoch=? AND name='artifacts_seal' AND state='done'", body.seal_id || '', taskId, body.epoch);
  demand(seal && JSON.parse(seal.result).ok, 'artifact_required', 'Consumer-sealed artifacts from this attempt are required.');
  store.run('INSERT INTO task_workspaces(task,required,seal_id) VALUES(?,1,?) ON CONFLICT(task) DO UPDATE SET seal_id=excluded.seal_id', taskId, seal.id);
}
