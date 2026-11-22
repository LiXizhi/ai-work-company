import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identifier } from '../client.mjs';
import { TOOL_NAMES } from '../../backend/relay.mjs';
import { createProcessStopper } from '../platform.mjs';

const gateway = fileURLToPath(new URL('../cli.mjs', import.meta.url));

export async function runClaude({
  base,
  lease,
  prompt,
  textOnly,
  runDir,
  claude = process.env.AWC_CLAUDE || 'claude',
  timeoutMs = 180000,
  signal,
  onEvent = () => {},
}) {
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const schema = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    required: textOnly ? ['result'] : ['result', 'seal_id'],
    properties: textOnly
      ? { result: { type: 'string' } }
      : { result: { type: 'string' }, seal_id: { type: 'string' } },
  });

  const args = [
    '--print',
    '--output-format', 'json',
    '--json-schema', schema,
    '--model', lease.model,
    '--no-session-persistence',
    '--setting-sources', 'local',
    '--tools', '',
  ];

  const env = Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'USERPROFILE', 'SystemRoot', 'LANG', 'TMPDIR', 'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR']
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );

  if (!textOnly) {
    const mcpConfigPath = resolve(runDir, 'awc-mcp.json');
    await writeFile(mcpConfigPath, JSON.stringify({
      mcpServers: {
        awc: {
          command: process.execPath,
          args: [gateway, 'mcp'],
          env: {
            AWC_BASE_URL: base,
            AWC_TASK_ID: lease.id,
            AWC_TOOL_TOKEN: lease.tool_token,
          },
        },
      },
    }), { mode: 0o600 });
    args.push('--strict-mcp-config', '--mcp-config', mcpConfigPath);
    args.push('--allowedTools', TOOL_NAMES.map((name) => `mcp__awc__${name}`).join(','));
  } else {
    args.push('--strict-mcp-config');
  }

  const detached = process.platform !== 'win32';
  const child = spawn(claude, args, { env, cwd: runDir, detached, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const { stop, cleanup } = createProcessStopper(child);
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  child.stdin.on('error', () => stop());

  let stdout = '', stderr = '', bytes = 0, limitError = null;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 2_000_000) { limitError = 'agent_output_limit'; stop(); return; }
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => { if (stderr.length < 12000) stderr += chunk; });
  child.stdin.end(prompt);

  let code;
  try {
    code = await new Promise((done, reject) => { child.on('error', reject); child.on('exit', done); });
  } finally {
    clearTimeout(timer);
    cleanup();
    signal?.removeEventListener('abort', stop);
    stop();
  }

  if (signal?.aborted) throw new Error('worker_stopped');
  if (code !== 0 || limitError) {
    const error = new Error(limitError || 'claude_execution_failed');
    error.diagnostics = stderr;
    throw error;
  }

  let envelope;
  try { envelope = JSON.parse(stdout.trim()); } catch { throw new Error('invalid_claude_json'); }
  const structured = envelope.structured_output
    || (typeof envelope.result === 'string' && envelope.result.trim().startsWith('{') ? JSON.parse(envelope.result) : { result: envelope.result });
  if (!structured || typeof structured.result !== 'string' || !structured.result.trim()) throw new Error('invalid_agent_result');
  const toolEvents = Array.isArray(envelope.tool_events) ? envelope.tool_events : [];
  for (const ev of toolEvents) onEvent({ event: 'agent_tool', ...ev });
  if (!textOnly) {
    identifier(structured.seal_id);
  }
  const rawUsage = envelope.usage || {};
  const inputBase = Number(rawUsage.input_tokens ?? 0);
  const cached = Number(rawUsage.cache_read_input_tokens ?? rawUsage.cached_input_tokens ?? 0);
  const outputTokens = Number(rawUsage.output_tokens ?? 0);
  if (!Number.isSafeInteger(inputBase) || !Number.isSafeInteger(cached) || !Number.isSafeInteger(outputTokens) || inputBase < 0 || cached < 0 || outputTokens < 0) {
    throw new Error('missing_usage_record');
  }
  const usage = {
    input_tokens: inputBase + cached,
    cached_input_tokens: cached,
    cache_write_input_tokens: 0,
    output_tokens: outputTokens,
  };
  return {
    result: structured.result,
    ...(structured.seal_id ? { seal_id: structured.seal_id } : {}),
    usage,
    toolEvents,
    requested_model: lease.model,
    evidence_kind: 'local_claude_cli_observation',
  };
}
