import { randomUUID } from 'node:crypto';

export class Api {
  constructor(base, token) {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('Use HTTPS, or HTTP on loopback only.');
    this.base = url.origin; this.token = token;
    if (typeof token !== 'string' || !token) throw new Error('An instance token is required.');
  }
  async request(path, body, key = randomUUID()) {
    if (!path.startsWith('/v1/')) throw new Error('Invalid API path.');
    const response = await fetch(this.base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${this.token}`, ...(body !== undefined && { 'Content-Type': 'application/json', 'Idempotency-Key': key }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (Buffer.byteLength(text) > 1_000_000) throw new Error('Oversized server response.');
    const value = JSON.parse(text);
    if (!response.ok) { const error = new Error(value.error?.code || 'request_failed'); error.code = value.error?.code; error.status = response.status; throw error; }
    return value;
  }
}
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z]+_[a-f0-9-]{36}$/.test(value)) throw new Error('Invalid identifier.');
  return value;
}
export async function callTool(api, task, name, args, key = randomUUID(), timeout = 40000) {
  identifier(task);
  const call = await api.request(`/v1/tasks/${task}/tools`, { name, arguments: args }, key);
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const reply = await api.request(`/v1/tasks/${task}/tool-results/${identifier(call.id)}`);
    if (reply.state === 'done') return { ...reply.result, receipt_id: reply.id };
    await pause(1500);
  }
  throw new Error('consumer_unavailable_or_tool_timeout');
}
