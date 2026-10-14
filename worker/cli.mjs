#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { Api, callTool, identifier } from './client.mjs';
import { TOOLS } from '../backend/relay.mjs';

const api = new Api(process.env.AWC_BASE_URL || 'http://127.0.0.1:8787', process.env.AWC_TOOL_TOKEN);
const task = identifier(process.env.AWC_TASK_ID);
const mode = process.argv[2];
const session = randomUUID();
let buffer = '', queued = Promise.resolve(), calls = 0;
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');

async function rpc(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return emit({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
  if (message.id === undefined) return; // Notifications never produce responses.
  const id = message.id;
  if (!(typeof id === 'string' && id.length <= 128) && !Number.isSafeInteger(id)) return emit({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request id' } });
  const reply = (result) => emit({ jsonrpc: '2.0', id, result });
  if (message.method === 'initialize') {
    const versions = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
    return reply({ protocolVersion: versions.includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2025-11-25', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'awc-task-files', version: '0.2.0' } });
  }
  if (message.method === 'ping') return reply({});
  if (message.method === 'tools/list') return reply({ tools: TOOLS });
  if (message.method !== 'tools/call') return emit({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not available in this task' } });
  try {
    const value = await callTool(api, task, message.params?.name, message.params?.arguments, `${session}:${id}`);
    reply({ content: [{ type: 'text', text: JSON.stringify(value) }], isError: !value.ok });
  } catch (error) {
    reply({ content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error.code || 'task_tool_failed' }) }], isError: true });
  }
}

if (!['mcp', 'call'].includes(mode)) { console.error('Usage: node worker/cli.mjs mcp|call; provide task capability via AWC_TOOL_TOKEN, AWC_TASK_ID, AWC_BASE_URL. JSON is read from stdin.'); process.exit(1); }
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  if (Buffer.byteLength(buffer) > 65536) { process.stderr.write('Message limit exceeded.\n'); process.exit(1); }
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    if (++calls > 1000) process.exit(1);
    queued = queued.then(async () => {
      let message;
      try { message = JSON.parse(line); }
      catch { if (mode === 'mcp') emit({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); else emit({ ok: false, error: 'invalid_json' }); return; }
      if (mode === 'mcp') return rpc(message);
      try { emit(await callTool(api, task, message.name, message.arguments)); }
      catch (error) { emit({ ok: false, error: error.code || 'task_tool_failed' }); process.exitCode = 1; }
    });
  }
});
process.stdin.on('end', () => { queued.finally(() => { if (buffer.trim()) process.exitCode = 1; }); });
