import http from 'node:http';
import { initAdmin, authenticateAdmin, adminGet, adminPost, adminOpenapiPaths } from './admin-web.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Store, Fault } from './store.mjs';
import { initRelay, mintToolCap, authorizeTool, enqueueTool, pendingTools, completeTool, bindSubmission } from './relay.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
};
const definitions = [
  ['GET', '/v1/models', [], []],
  ['POST', '/v1/quote', ['model','usage'], ['model','usage']],
  ['GET', '/v1/trials', [], []],
  ['POST', '/v1/trials/claim', ['worker_id'], ['worker_id']],
  ['POST', '/v1/trials/{id}/heartbeat', ['epoch'], ['epoch']],
  ['POST', '/v1/trials/{id}/submit', ['epoch','result','usage'], ['epoch','result','usage']],
  ['GET', '/v1/me', [], []],
  ['GET', '/v1/ledger', [], []],
  ['GET', '/v1/workers', [], []],
  ['POST', '/v1/workers', ['name', 'model', 'accept_trial'], ['name', 'model', 'accept_trial']],
  ['GET', '/v1/queue', [], []],
  ['GET', '/v1/tasks', [], []],
  ['POST', '/v1/tasks', ['title', 'description', 'model', 'amount_minor', 'deadline', 'workspace_required'], ['title', 'description', 'model', 'amount_minor']],
  ['GET', '/v1/tasks/{id}', [], []],
  ['POST', '/v1/tasks/{id}/claim', ['worker_id'], ['worker_id']],
  ['POST', '/v1/tasks/{id}/heartbeat', ['epoch'], ['epoch']],
  ['POST', '/v1/tasks/{id}/submit', ['epoch', 'result', 'seal_id'], ['epoch', 'result']],
  ['POST', '/v1/tasks/{id}/accept', ['rating'], ['rating']],
  ['POST', '/v1/tasks/{id}/cancel', [], []],
  ['POST', '/v1/tasks/{id}/tools', ['name', 'arguments'], ['name', 'arguments']],
  ['GET', '/v1/tasks/{id}/tool-results/{call}', [], []],
  ['POST', '/v1/tasks/{id}/tool-results/{call}', ['result'], ['result']],
  ['GET', '/v1/tasks/{id}/execution', [], []],
];
const props = {
  name: { type: 'string', minLength: 1, maxLength: 80 },
  model: { type: 'string', minLength: 1, maxLength: 200 },
  accept_trial: { type: 'boolean', const: true },
  title: { type: 'string', minLength: 1, maxLength: 160 },
  description: { type: 'string', minLength: 1, maxLength: 20000 },
  amount_minor: { type: 'integer', minimum: 1, maximum: 1000000, description: '100 minor units = 1 internal work credit.' },
  deadline: { type: 'string', format: 'date-time' },
  worker_id: { type: 'string' }, epoch: { type: 'integer', minimum: 1 },
  result: { type: 'string', minLength: 1, maxLength: 30000 }, rating: { type: 'integer', minimum: 1, maximum: 5 },
  usage: { type: 'object', additionalProperties: false, required: ['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens'], properties: Object.fromEntries(['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens'].map(k=>[k,{type:'integer',minimum:0,maximum:1000000000}])) },
  workspace_required: { type: 'boolean', default: false }, seal_id: { type: 'string' }, arguments: { type: 'object' },
};
export function openapi() {
  const paths = {};
  const rows = [['GET', '/health', [], []], ['GET', '/v1/capabilities', [], []], ['POST', '/v1/accounts', ['name'], ['name']], ...definitions];
  for (const [method, path, fields, required] of rows) {
    const publicRoute = ['/health', '/v1/capabilities', '/v1/accounts'].includes(path);
    const operation = {
      operationId: `${method.toLowerCase()}_${path.replace(/[^a-z0-9]+/gi, '_')}`,
      security: publicRoute ? [] : [{ [(path.endsWith('/tools') || (method === 'GET' && path.includes('tool-results'))) ? 'taskCapability' : 'bearerAuth']: [] }],
      parameters: [],
      responses: {
        200: { description: 'Successful JSON response; see agent.md for the response fields.', content: { 'application/json': { schema: { type: 'object' } } } },
        default: { description: 'Structured failure. No business mutation is committed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    };
    if (path.includes('{id}')) operation.parameters.push({ name: 'id', in: 'path', required: true, schema: { type: 'string' } });
    if (path.includes('{call}')) operation.parameters.push({ name: 'call', in: 'path', required: true, schema: { type: 'string' } });
    if (['/v1/queue','/v1/trials'].includes(path)) operation.parameters.push({ name: 'worker_id', in: 'query', required: true, schema: { type: 'string' } });
    if (method === 'POST') {
      if (!publicRoute) operation.parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } });
      operation.requestBody = { required: true, content: { 'application/json': { schema: {
        type: 'object', additionalProperties: false, required, properties: Object.fromEntries(fields.map((f) => [f, path.includes('tool-results') && f === 'result' ? { type: 'object' } : props[f]])),
      } } } };
    }
    paths[path] ??= {}; paths[path][method.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0', info: { title: 'AI Work Company', version: '0.2.0', description: 'Self-hosted reference API. No hosted marketplace API is advertised by the documentation site.' },
    servers: [{ url: 'http://127.0.0.1:8787', description: 'Your local reference server' }], paths: {...paths,...adminOpenapiPaths()},
    components: {
      securitySchemes: { adminBearer: {type:'http',scheme:'bearer',description:'Separate operator credential; account and task tokens are not accepted.'}, bearerAuth: { type: 'http', scheme: 'bearer' }, taskCapability: { type: 'http', scheme: 'bearer', description: 'Claim tool_token, scoped to task and lease epoch; cannot access account APIs.' } },
      schemas: { Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } } },
    },
  };
}
function validate(body, fields, required) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !fields.includes(k)) || required.some((k) => !(k in body))) {
    throw new Fault(400, 'invalid_input', 'JSON fields do not match the API contract.');
  }
}
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new Fault(415, 'json_required', 'Use Content-Type: application/json.');
  return new Promise((resolveBody, reject) => {
    let size = 0, parts = [], overflow = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 65536) { if (!overflow) reject(new Fault(413, 'body_too_large', 'Maximum request size is 64 KiB.')); overflow = true; parts = []; }
      else if (!overflow) parts.push(chunk);
    });
    req.on('end', () => {
      if (overflow) return;
      try { resolveBody(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch { reject(new Fault(400, 'invalid_json', 'Malformed JSON.')); }
    });
    req.on('error', () => reject(new Fault(400, 'request_error', 'Request could not be read.')));
  });
}

export function createServer(store, { allowedHosts = ['127.0.0.1', 'localhost', '[::1]'], adminToken = process.env.AWC_ADMIN_TOKEN } = {}) {
  initRelay(store); initAdmin(store);
  const staticFiles = new Map();
  for (const [url, name, mime] of [
    ['/', 'index.html', 'text/html'], ['/style.css', 'style.css', 'text/css'], ['/app.js', 'app.js', 'text/javascript'],
    ['/llms.txt', 'llms.txt', 'text/plain'], ['/agent.md', 'agent.md', 'text/markdown'],
    ['/.well-known/agent.json', '.well-known/agent.json', 'application/json'],
    ['/favicon.svg', 'favicon.svg', 'image/svg+xml'],
  ]) {
    const path = resolve(root, 'site', name);
    if (existsSync(path)) staticFiles.set(url, { body: readFileSync(path), mime });
  }
  for (const name of ['business-model-analysis.html', 'business-model-analysis-v1.html']) {
    const path = resolve(root, 'docs', name);
    if (existsSync(path)) staticFiles.set(`/${name}`, { body: readFileSync(path), mime: 'text/html' });
  }
  for (const [url,name,mime] of [['/admin/','index.html','text/html'],['/admin','index.html','text/html'],['/admin/app.js','app.js','text/javascript'],['/admin/style.css','style.css','text/css']]) {
    const path=resolve(root,'admin',name); if(existsSync(path)) staticFiles.set(url,{body:readFileSync(path),mime});
  }
  const buckets = new Map();
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { ...securityHeaders, ...jsonHeaders }); res.end(JSON.stringify(value)); };
    try {
      const host = new URL(`http://${req.headers.host || 'invalid'}`).hostname;
      if (!allowedHosts.includes(host)) throw new Fault(403, 'host_denied', 'Host is not configured for this instance.');
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) throw new Fault(403, 'origin_denied', 'Cross-origin access is disabled.');
      }
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname, method = req.method;
      if (method === 'GET' && staticFiles.has(path)) {
        const file = staticFiles.get(path);
        res.writeHead(200, { ...securityHeaders, 'Cache-Control':'no-store', 'Content-Type': `${file.mime}; charset=utf-8` }); res.end(file.body); return;
      }
      if (method === 'GET' && path === '/openapi.json') { send(200, openapi()); return; }
      if (method === 'GET' && path === '/health') { send(200, { status: 'ok', version: '0.2.0' }); return; }
      if (method === 'GET' && path === '/v1/capabilities') {
        send(200, { version: '0.2.0', models: store.models, unit: 'work_credit_minor', minor_per_credit: 100,
          defaults: { deadline_hours: 72, daily_limit_minor: 1000, consumer_concurrency: 1, max_attempts: 3, lease_seconds: 60 },
          available: ['accounts', 'workers', 'queue', 'leases', 'text_deliverables', 'ledger', 'ratings', 'operator_review', 'task_tool_relay', 'posix_file_broker', 'worker_cli', 'worker_stdio_mcp', 'automatic_trial_dispatch', 'versioned_token_pricing', 'model_catalog', 'operator_console'],
          unavailable: ['recharge', 'cashout', 'automatic_model_attestation', 'arbitrary_code_sandbox', 'image_generation', 'alive_tasks'],
          evidence: 'operator_reviewed; not cryptographic model attestation' }); return;
      }
      if (!path.startsWith('/v1/') && !path.startsWith('/admin/api/')) throw new Fault(404, 'not_found', 'Route not found.');
      // Socket peer is used intentionally; untrusted X-Forwarded-For cannot bypass limits.
      const rateKey = req.socket.remoteAddress, now = Date.now();
      if (buckets.size > 10000) for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
      const bucket = buckets.get(rateKey) ?? { count: 0, until: now + 60000 };
      if (bucket.until <= now) { bucket.count = 0; bucket.until = now + 60000; }
      buckets.set(rateKey, bucket);
      if (++bucket.count > 120) throw new Fault(429, 'rate_limited', 'Retry after the one-minute request window.');
      if (path.startsWith('/admin/api/')) {
        const secret=(req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
        authenticateAdmin(adminToken,secret);
        store.sweep();
        if(method==='GET') { send(200,adminGet(store,url)); return; }
        if(method==='POST') {
          if(!req.headers.origin) throw new Fault(403,'origin_required','Same-origin browser request required.');
          const body=await readBody(req);
          send(200,adminPost(store,path,body,req.headers['idempotency-key'])); return;
        }
        throw new Fault(405,'method_not_allowed','Unsupported admin method.');
      }
      if (method === 'POST' && path === '/v1/accounts') {
        const body = await readBody(req); validate(body, ['name'], ['name']);
        send(200, store.register(body.name)); return;
      }
      const authorization = req.headers.authorization || '';
      const secret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const toolRoute = path.match(/^\/v1\/tasks\/([^/]+)\/(tools|tool-results\/([^/]+))$/);
      if (toolRoute && ((method === 'POST' && toolRoute[2] === 'tools') || method === 'GET')) {
        store.sweep();
        const { cap } = authorizeTool(store, secret, toolRoute[1]);
        if (method === 'GET') {
          const call = store.one('SELECT id,state,result FROM tool_calls WHERE id=? AND task=? AND epoch=? AND worker=?', toolRoute[3] || '', cap.task, cap.epoch, cap.worker);
          if (!call) throw new Fault(404, 'not_found', 'Tool call not found.');
          send(200, { ...call, result: call.result ? JSON.parse(call.result) : null }); return;
        }
        const body = await readBody(req); validate(body, ['name', 'arguments'], ['name', 'arguments']);
        send(200, store.mutation(`${cap.worker}:${cap.task}:${cap.epoch}`, path, req.headers['idempotency-key'], body, () => { authorizeTool(store, secret, cap.task); return enqueueTool(store, cap, body.name, body.arguments); })); return;
      }
      const account = store.authenticate(secret);
      store.sweep();
      if (method === 'GET' && path === '/v1/models') { send(200, {models:store.trials.catalog()}); return; }
      if (method === 'GET' && path === '/v1/trials') {
        const worker = url.searchParams.get('worker_id');
        const progress = store.trials.progress(account.id, worker);
        send(200, {...progress, runs:store.all('SELECT id,state,model,price,max_tokens,reserved,reported_usage,reviewed_usage,value,evidence_ref,result FROM trial_runs WHERE worker=? ORDER BY created_at DESC LIMIT 100',worker)}); return;
      }
      const trialRoute = path.match(/^\/v1\/trials\/([^/]+)\/(heartbeat|submit)$/);
      if (method === 'POST' && (path === '/v1/quote' || path === '/v1/trials/claim' || trialRoute)) {
        const definition = definitions.find(([m,p])=>m==='POST' && p===(trialRoute ? `/v1/trials/{id}/${trialRoute[2]}` : path));
        const body = await readBody(req); validate(body, definition[2], definition[3]);
        send(200,store.mutation(account.id,path,req.headers['idempotency-key'],body,()=> {
          if(path==='/v1/quote') return store.trials.quote(body.model,body.usage);
          if(path==='/v1/trials/claim') return store.trials.claim(account.id,body.worker_id);
          if(trialRoute[2]==='heartbeat') return store.trials.heartbeat(account.id,trialRoute[1],body.epoch);
          return store.trials.submit(account.id,trialRoute[1],body);
        })); return;
      }
      const executionRoute = path.match(/^\/v1\/tasks\/([^/]+)\/execution$/);
      if (method === 'GET' && executionRoute) { send(200, pendingTools(store, account.id, executionRoute[1])); return; }
      if (method === 'POST' && toolRoute && toolRoute[3]) {
        const body = await readBody(req); validate(body, ['result'], ['result']);
        send(200, store.mutation(account.id, path, req.headers['idempotency-key'], body, () => completeTool(store, account.id, toolRoute[1], toolRoute[3], body.result))); return;
      }
      if (method === 'GET') {
        if (path === '/v1/me') { send(200, store.wallet(account.id)); return; }
        if (path === '/v1/ledger') { send(200, { entries: store.all('SELECT * FROM ledger WHERE account=? ORDER BY seq DESC LIMIT 100', account.id) }); return; }
        if (path === '/v1/workers') { send(200, { workers: store.all('SELECT * FROM workers WHERE owner=?', account.id) }); return; }
        if (path === '/v1/tasks') { send(200, { tasks: store.all('SELECT * FROM tasks WHERE owner=? OR worker IN (SELECT id FROM workers WHERE owner=?) ORDER BY created_at DESC LIMIT 100', account.id, account.id) }); return; }
        if (path === '/v1/queue') { send(200, { tasks: store.queue(account.id, url.searchParams.get('worker_id')) }); return; }
        if (/^\/v1\/tasks\/[^/]+$/.test(path)) { send(200, store.task(account.id, path.split('/')[3])); return; }
      }
      const match = path.match(/^\/v1\/tasks\/([^/]+)\/(claim|heartbeat|submit|accept|cancel)$/);
      const definitionPath = match ? `/v1/tasks/{id}/${match[2]}` : path;
      const definition = definitions.find(([m, p]) => m === method && p === definitionPath);
      if (!definition || method !== 'POST') throw new Fault(404, 'not_found', 'Route not found.');
      const body = await readBody(req); validate(body, definition[2], definition[3]);
      const result = store.mutation(account.id, path, req.headers['idempotency-key'], body, () => {
        if (path === '/v1/workers') return store.registerWorker(account.id, body);
        if (path === '/v1/tasks') {
          if (body.workspace_required !== undefined && typeof body.workspace_required !== 'boolean') throw new Fault(400, 'invalid_input', 'workspace_required must be boolean.');
          const task = store.createTask(account.id, body);
          store.run('INSERT INTO task_workspaces(task,required) VALUES(?,?)', task.id, body.workspace_required ? 1 : 0);
          return task;
        }
        const [, taskId, action] = match;
        if (action === 'claim') { const task = store.claim(account.id, taskId, body.worker_id); return { ...task, tool_token: mintToolCap(store, task) }; }
        if (action === 'heartbeat') return store.heartbeat(account.id, taskId, body.epoch);
        if (action === 'submit') { const task = store.submit(account.id, taskId, body); bindSubmission(store, taskId, body); return task; }
        if (action === 'accept') return store.accept(account.id, taskId, body);
        return store.cancel(account.id, taskId);
      });
      send(200, result);
    } catch (error) {
      const known = error instanceof Fault;
      send(known ? error.status : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Request failed without committing changes.' } });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const store = new Store(process.env.AWC_DB || 'data/company.sqlite', { models: (process.env.AWC_MODELS || 'claude-opus-5.5,gpt-6-astra').split(',') });
  const host = process.env.AWC_HOST || '127.0.0.1', port = Number(process.env.AWC_PORT || 8787);
  const server = createServer(store, { allowedHosts: (process.env.AWC_ALLOWED_HOSTS || '127.0.0.1,localhost,[::1]').split(',') });
  const timer = setInterval(() => { try { store.sweep(); } catch { console.error('Task expiry sweep failed.'); } }, 5000);
  timer.unref();
  server.listen(port, host, () => console.log(`AI Work Company reference server: http://${host}:${port}`));
  const stop = () => { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
