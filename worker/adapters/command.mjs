import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identifier } from '../client.mjs';
import { createProcessStopper } from '../platform.mjs';

const gateway = fileURLToPath(new URL('../cli.mjs', import.meta.url));

export function validateCommandAdapterConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('invalid_command_adapter');
  if (typeof cfg.executable !== 'string' || !cfg.executable.trim() || !isAbsolute(cfg.executable)) {
    throw new Error('command_adapter_executable_must_be_absolute');
  }
  if (cfg.args !== undefined && (!Array.isArray(cfg.args) || cfg.args.some((a) => typeof a !== 'string' || a.length > 512))) {
    throw new Error('invalid_command_adapter_args');
  }
  return { executable: cfg.executable, args: cfg.args || [] };
}

export async function runCommandAdapter({
  base,
  lease,
  prompt,
  textOnly,
  runDir,
  commandConfig,
  timeoutMs = 180000,
  signal,
  onEvent = () => {},
}) {
  const { executable, args } = validateCommandAdapterConfig(commandConfig);
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const env = Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'USERPROFILE', 'SystemRoot', 'LANG', 'TMPDIR']
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  if (!textOnly) {
    Object.assign(env, {
      AWC_BASE_URL: base,
      AWC_TASK_ID: lease.id,
      AWC_TOOL_TOKEN: lease.tool_token,
      AWC_GATEWAY_SCRIPT: gateway,
    });
  }

  const detached = process.platform !== 'win32';
  // Never spawn through a shell; arguments are passed verbatim to the owner-configured binary.
  const child = spawn(executable, args, { env, cwd: runDir, detached, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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

  const requestPayload = JSON.stringify({
    version: 1,
    task_id: lease.id,
    model: lease.model,
    text_only: textOnly,
    category: lease.category || 'general_files',
    skill_id: lease.skill_id || null,
    max_tokens: lease.max_tokens || null,
    prompt,
  });
  child.stdin.end(requestPayload);

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
    const error = new Error(limitError || 'command_adapter_failed');
    error.diagnostics = stderr;
    throw error;
  }

  let parsed;
  try { parsed = JSON.parse(stdout.trim()); } catch { throw new Error('invalid_command_adapter_json'); }
  if (!parsed || typeof parsed.result !== 'string' || !parsed.result.trim()) throw new Error('invalid_agent_result');
  const toolEvents = Array.isArray(parsed.toolEvents) ? parsed.toolEvents : [];
  for (const ev of toolEvents) onEvent({ event: 'agent_tool', ...ev });
  if (!textOnly) {
    identifier(parsed.seal_id);
  }
  const usage = parsed.usage;
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens) || usage.input_tokens < 0 || usage.output_tokens < 0) {
    throw new Error('missing_usage_record');
  }
  return {
    result: parsed.result,
    ...(parsed.seal_id ? { seal_id: parsed.seal_id } : {}),
    usage: {
      input_tokens: usage.input_tokens,
      cached_input_tokens: Number.isSafeInteger(usage.cached_input_tokens) ? usage.cached_input_tokens : 0,
      cache_write_input_tokens: Number.isSafeInteger(usage.cache_write_input_tokens) ? usage.cache_write_input_tokens : 0,
      output_tokens: usage.output_tokens,
    },
    toolEvents,
    requested_model: lease.model,
    evidence_kind: 'unverified_custom_adapter',
  };
}
