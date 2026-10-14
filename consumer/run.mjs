import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Api, pause, identifier } from '../worker/client.mjs';

const brokerPath = fileURLToPath(new URL('./file_broker.py', import.meta.url));
export function startBroker(root, input, python = process.env.AWC_PYTHON || '/usr/bin/python3') {
  const child = spawn(python, ['-I', '-B', brokerPath, root, input], {
    env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map(); let buffer = '', closed = false, readyResolve, readyReject;
  const ready = new Promise((resolveReady, rejectReady) => { readyResolve = resolveReady; readyReject = rejectReady; });
  const stop = () => { if (!closed) child.kill('SIGTERM'); };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 128000) { stop(); return; }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      let message;
      try { message = JSON.parse(line); } catch { stop(); return; }
      if ('ready' in message) { if (message.ready) readyResolve(); else readyReject(new Error('workspace_start_failed')); }
      else { const item = pending.get(message.id); if (item) { pending.delete(message.id); clearTimeout(item.timer); item.resolve(message.result); } }
    }
  });
  child.stderr.resume(); // Never forward host diagnostics to Worker responses.
  const fail = () => {
    closed = true; readyReject(new Error('file_broker_stopped'));
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('file_broker_stopped')); }
    pending.clear();
  };
  child.stdin.on('error', fail); child.on('error', fail); child.on('exit', fail);
  return { ready, stop, child,
    async invoke(request) {
      await ready;
      if (closed) throw new Error('file_broker_stopped');
      if (pending.size) throw new Error('file_broker_busy');
      return new Promise((resolveResult, reject) => {
        const timer = setTimeout(() => { pending.delete(request.id); stop(); reject(new Error('file_broker_timeout')); }, 5000);
        pending.set(request.id, { resolve: resolveResult, reject, timer });
        child.stdin.write(JSON.stringify(request) + '\n');
      });
    },
  };
}

export async function consume({ api, taskId, input, root, signal, pollMs = 1500, onEvent = () => {} }) {
  identifier(taskId);
  input = resolve(input); root = resolve(root);
  // Root is chosen by the local owner; each lease gets a fresh private attempt.
  await mkdir(root, { recursive: true, mode: 0o700 });
  let broker, epoch, stopped = false;
  const outbox = new Map();
  const stop = () => { stopped = true; broker?.stop(); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    while (!stopped) {
      const before = Date.now();
      const snapshot = await api.request(`/v1/tasks/${taskId}/execution`);
      if (['submitted', 'completed', 'cancelled', 'expired', 'failed', 'security_stopped', 'refunded'].includes(snapshot.task.state)) return { state: snapshot.task.state, epoch };
      if (snapshot.task.state === 'running') {
        if (epoch !== snapshot.task.epoch) {
          broker?.stop(); outbox.clear(); epoch = snapshot.task.epoch;
          broker = startBroker(resolve(root, `attempt-${epoch}`), input);
          await broker.ready;
          onEvent({ event: 'workspace_ready', task: taskId, epoch });
        }
        for (const call of snapshot.calls) {
          if (stopped) break;
          // Reauthorize immediately before execution. Worker-supplied lease times are never used.
          const checkedAt = Date.now();
          const current = await api.request(`/v1/tasks/${taskId}/execution`);
          if (current.task.state !== 'running' || current.task.epoch !== epoch || current.task.worker !== call.worker || !current.calls.some((item) => item.id === call.id)) continue;
          const remaining = Math.min(60000, current.task.lease_until - current.server_time, current.task.deadline - current.server_time) - (Date.now() - checkedAt) - 50;
          if (remaining <= 0) continue;
          let result = outbox.get(call.id);
          if (!result) {
            result = await broker.invoke({ id: call.id, name: call.name, arguments: call.args, remaining_ms: remaining });
            outbox.set(call.id, result);
          }
          if (stopped) break;
          await api.request(`/v1/tasks/${taskId}/tool-results/${call.id}`, { result }, call.id);
          onEvent({ event: 'tool_result', task: taskId, epoch, id: call.id, name: call.name, ok: result.ok, error: result.error });
        }
      }
      await pause(Math.max(25, pollMs - (Date.now() - before)));
    }
    return { state: 'locally_stopped', epoch };
  } finally { signal?.removeEventListener('abort', stop); broker?.stop(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [taskId, input, root] = process.argv.slice(2);
  if (!taskId || !input || !root) { console.error('Usage: node consumer/run.mjs TASK_ID SELECTED_INPUT_DIRECTORY PRIVATE_WORKSPACE_PARENT'); process.exit(1); }
  const signal = new AbortController();
  process.once('SIGINT', () => signal.abort()); process.once('SIGTERM', () => signal.abort());
  consume({ api: new Api(process.env.AWC_BASE_URL || 'http://127.0.0.1:8787', process.env.AWC_CONSUMER_TOKEN), taskId, input, root, signal: signal.signal,
    onEvent: (event) => console.log(JSON.stringify(event)),
  }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
