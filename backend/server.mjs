import { FreeTasks, freeOpenapiPaths } from './free-tasks.mjs';
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
  ['GET', '/v1/market', [], []],
  ['GET', '/v1/skills', [], []],
  ['GET', '/v1/models', [], []],
  ['POST', '/v1/quote', ['model','usage'], ['model','usage']],
  ['GET', '/v1/trials', [], []],
  ['POST', '/v1/trials/claim', ['worker_id'], ['worker_id']],
  ['POST', '/v1/trials/{id}/heartbeat', ['epoch'], ['epoch']],
  ['POST', '/v1/trials/{id}/submit', ['epoch','result','usage'], ['epoch','result','usage']],
  ['GET', '/v1/me', [], []],
  ['POST', '/v1/presence', ['category', 'worker_id'], []],
  ['GET', '/v1/whitelist', [], []],
  ['POST', '/v1/whitelist', ['worker_id', 'category', 'spotcheck_percent'], ['worker_id']],
  ['GET', '/v1/ledger', [], []],
  ['GET', '/v1/workers', [], []],
  ['POST', '/v1/workers', ['name', 'model', 'accept_trial'], ['name', 'model', 'accept_trial']],
  ['GET', '/v1/queue', [], []],
  ['GET', '/v1/tasks', [], []],
  ['POST', '/v1/tasks', ['title', 'description', 'model', 'amount_minor', 'deadline', 'workspace_required', 'category', 'skill_id', 'system_prompt', 'expected_minutes', 'min_trust_tier', 'judge_mode', 'judge_rubric', 'min_payout_percent'], ['title', 'description', 'model', 'amount_minor']],
  ['GET', '/v1/tasks/{id}', [], []],
  ['POST', '/v1/tasks/{id}/claim', ['worker_id'], ['worker_id']],
  ['POST', '/v1/tasks/{id}/heartbeat', ['epoch'], ['epoch']],
  ['POST', '/v1/tasks/{id}/abort-unsafe', ['epoch', 'reason'], ['epoch', 'reason']],
  ['POST', '/v1/tasks/{id}/submit', ['epoch', 'result', 'seal_id'], ['epoch', 'result']],
  ['POST', '/v1/tasks/{id}/judge', ['payout_percent', 'rating', 'reason', 'recommend_whitelist', 'suspect_model_spoofing', 'unsafe_deliverable'], ['payout_percent', 'rating']],
  ['POST', '/v1/tasks/{id}/accept', ['rating', 'payout_percent'], ['rating']],
  ['POST', '/v1/tasks/{id}/rate-consumer', ['rating'], ['rating']],
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
  category: { type: 'string', enum: ['art_works', 'mini_games', 'reverse_engineering', 'general_files'] },
  skill_id: { type: 'string', minLength: 1, maxLength: 120 },
  system_prompt: { type: 'string', maxLength: 4000 },
  expected_minutes: { type: 'integer', minimum: 1, maximum: 4320 },
  min_trust_tier: { type: 'string', enum: ['probation', 'standard', 'trusted'] },
  judge_mode: { type: 'string', enum: ['human', 'consumer_ai', 'whitelist_spotcheck'] },
  judge_rubric: { type: 'string', maxLength: 4000 },
  min_payout_percent: { type: 'integer', minimum: 50, maximum: 100 },
  payout_percent: { type: 'integer', minimum: 0, maximum: 100 },
  spotcheck_percent: { type: 'integer', minimum: 0, maximum: 100 },
  reason: { type: 'string', minLength: 1, maxLength: 2000 },
  recommend_whitelist: { type: 'boolean' },
  suspect_model_spoofing: { type: 'boolean' },
  unsafe_deliverable: { type: 'boolean' },
};
export function openapi() {
  const paths = {};
  const rows = [['GET', '/health', [], []], ['GET', '/v1/capabilities', [], []], ['POST', '/v1/accounts', ['name'], ['name']], ...definitions];
  for (const [method, path, fields, required] of rows) {
    const publicRoute = ['/health', '/v1/capabilities', '/v1/accounts', '/v1/market', '/v1/skills'].includes(path);
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
    if (path === '/v1/skills') operation.parameters.push({ name: 'category', in: 'query', required: false, schema: { type: 'string' } });
    if (method === 'POST') {
      if (!publicRoute) operation.parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } });
      operation.requestBody = { required: true, content: { 'application/json': { schema: {
        type: 'object', additionalProperties: false, required, properties: Object.fromEntries(fields.map((f) => [f, path.includes('tool-results') && f === 'result' ? { type: 'object' } : props[f]])),
      } } } };
    }
    paths[path] ??= {}; paths[path][method.toLowerCase()] = operation;
  }
  paths['/v1/me'].get.responses[200].description='Wallet: available is unfrozen ledger balance; spendable_minor is available only for platform employer or qualifying_minutes >= required_minutes (120). locked_earnings_minor is gated income. trial_locked_minor is permanent non-spendable approved trial contribution. No recharge or withdrawal.';
  return {
    openapi: '3.1.0', info: { title: 'AI Work Company', version: '0.2.0', description: 'Self-hosted reference API. Bounded continuous local Workers reuse existing lease and idempotency endpoints; independent evidence review and Consumer acceptance remain required. No hosted marketplace API is advertised by the documentation site.' },
    servers: [{ url: 'http://localhost:5003', description: 'Your local reference server' }], paths: {...paths,...adminOpenapiPaths(),...freeOpenapiPaths()},
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
  initRelay(store); initAdmin(store); store.freeTasks=new FreeTasks(store);
  const staticFiles = new Map();
  for (const [url, name, mime] of [
    ['/', 'index.html', 'text/html'], ['/style.css', 'style.css', 'text/css'], ['/app.js', 'app.js', 'text/javascript'],
    ['/guide.html', 'guide.html', 'text/html'],
    ['/world.css', 'world.css', 'text/css'], ['/world-layout.css', 'world-layout.css', 'text/css'],
    ['/world.js', 'world.js', 'text/javascript'], ['/world-state.mjs', 'world-state.mjs', 'text/javascript'],
    ['/assets/persona-portraits.png', 'assets/persona-portraits.png', 'image/png'],
    ...['world-scene.mjs','world-scene-core.mjs','world-map.mjs','world-map-core.mjs'].map(name=>['/'+name,name,'text/javascript']),
    ['/world-rig.mjs', 'world-rig.mjs', 'text/javascript'],
    ['/sprite-lab.html', 'sprite-lab.html', 'text/html'],
    ['/sprite-lab.js', 'sprite-lab.js', 'text/javascript'], ['/sprite-lab.css', 'sprite-lab.css', 'text/css'],
    ['/llms.txt', 'llms.txt', 'text/plain'], ['/agent.md', 'agent.md', 'text/markdown'],
    ['/.well-known/agent.json', '.well-known/agent.json', 'application/json'],
    ['/favicon.svg', 'favicon.svg', 'image/svg+xml'],
    ['/skills/public-pages-handoff.md','skills/public-pages-handoff.md','text/markdown'],
  ]) {
    const path = resolve(root, 'site', name);
    if (existsSync(path)) staticFiles.set(url, { body: readFileSync(path), mime });
  }
  // Build-time pinned assets only; this is not a user-controlled filesystem route.
  const haqiIndex=resolve(root,'site/vendor/haqi/provenance.json');
  if(existsSync(haqiIndex)) {
    const provenance=JSON.parse(readFileSync(haqiIndex,'utf8'));
    for(const name of Object.keys(provenance.outputs)) {
      if(!/^(?:vendor\/haqi(?:-data)?|assets)\/[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').includes('..'))throw Error('Invalid shared asset path');
      const mime=name.endsWith('.js')?'text/javascript':name.endsWith('.json')?'application/json':name.endsWith('.webp')?'image/webp':null;
      if(!mime)throw Error('Unsupported shared asset type');
      staticFiles.set('/'+name,{body:readFileSync(resolve(root,'site',name)),mime});
    }
  }
  if(existsSync(resolve(root,'docs/report.css'))) staticFiles.set('/report.css',{body:readFileSync(resolve(root,'docs/report.css')),mime:'text/css'});
  for (const name of ['business-model-analysis','autonomous-operation-plan']) for (const ext of ['md','html']) {
    const path=resolve(root,'docs',`${name}.${ext}`);
    if(existsSync(path)) staticFiles.set(`/${name}.${ext}`,{body:readFileSync(path),mime:ext==='html'?'text/html':'text/markdown'});
  }
  for (const [url,name,mime] of [['/admin/','index.html','text/html'],['/admin','index.html','text/html'],['/admin/app.js','app.js','text/javascript'],['/admin/style.css','style.css','text/css']]) {
    const path=resolve(root,'admin',name); if(existsSync(path)) staticFiles.set(url,{body:readFileSync(path),mime});
  }
  for (const [url,name,mime] of [['/company/','index.html','text/html'],['/company','index.html','text/html'],['/company/app.js','app.js','text/javascript'],['/company/style.css','style.css','text/css'],['/company/free-preview.js','free-preview.js','text/javascript']]) {
    const path=resolve(root,'company',name); if(existsSync(path)) staticFiles.set(url,{body:readFileSync(path),mime});
  }
  for(const [url,name,mime] of [['/free/','index.html','text/html'],['/free/app.js','app.js','text/javascript'],['/free/style.css','style.css','text/css']]) staticFiles.set(url,{body:readFileSync(resolve(root,'free',name)),mime});
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
        send(200, { version: '0.2.0', debug: !!store.debug, ledger_scope: store.debug?'isolated_test_only':'ordinary', models: store.models, unit: 'work_credit_minor', minor_per_credit: 100,
          defaults: { deadline_hours: 72, daily_limit_minor: 1000, consumer_concurrency: 1, max_attempts: 3, lease_seconds: 60 },
          available: ['public_free_tasks', 'public_task_outputs', 'work_to_hire_threshold', 'admin_system_text_tasks', 'bounded_local_continuous_worker', 'accounts', 'workers', 'queue', 'leases', 'text_deliverables', 'ledger', 'ratings', 'operator_review', 'task_tool_relay', 'posix_file_broker', 'worker_cli', 'worker_stdio_mcp', 'automatic_trial_dispatch', 'versioned_token_pricing', 'model_catalog', 'operator_console', 'categorized_market', 'company_skills', 'worker_prompt_verification', 'consumer_ai_judger', 'trust_tiers', 'whitelist_spotcheck', 'fraud_ban_enforcement'],
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
      if (method === 'GET' && path === '/v1/market') {
        store.sweep();
        send(200, store.market.snapshot()); return;
      }
      if (method === 'GET' && path === '/v1/skills') {
        send(200, { skills: store.market.skills(url.searchParams.get('category') || undefined) }); return;
      }
      if(method==='GET' && path==='/v1/free-tasks') {send(200,store.freeTasks.list(url));return;}
      if(method==='GET' && /^\/v1\/free-tasks\/free_[a-f0-9-]+$/.test(path)) {send(200,store.freeTasks.get(path.split('/')[3]));return;}
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
      if(method==='POST' && /^\/v1\/free-tasks(?:\/free_[a-f0-9-]+\/(?:claim|heartbeat|submit|cancel))?$/.test(path)) {
        store.freeTasks.sweep();const body=await readBody(req);const segments=path.split('/');send(200,store.mutation(account.id,path,req.headers['idempotency-key'],body,()=>store.freeTasks.mutate(account.id,segments[3],segments[4]||'create',body)));return;
      }
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
        if (path === '/v1/whitelist') { send(200, { items: store.market.listWhitelist(account.id) }); return; }
        if (path === '/v1/ledger') { send(200, { entries: store.all('SELECT * FROM ledger WHERE account=? ORDER BY seq DESC LIMIT 100', account.id) }); return; }
        if (path === '/v1/workers') { send(200, { workers: store.all('SELECT * FROM workers WHERE owner=?', account.id) }); return; }
        if (path === '/v1/tasks') { send(200, { tasks: store.all('SELECT * FROM tasks WHERE owner=? OR worker IN (SELECT id FROM workers WHERE owner=?) ORDER BY created_at DESC LIMIT 100', account.id, account.id) }); return; }
        if (path === '/v1/queue') { send(200, { tasks: store.queue(account.id, url.searchParams.get('worker_id')) }); return; }
        if (/^\/v1\/tasks\/[^/]+$/.test(path)) { send(200, store.task(account.id, path.split('/')[3])); return; }
      }
      const match = path.match(/^\/v1\/tasks\/([^/]+)\/(claim|heartbeat|abort-unsafe|submit|judge|accept|rate-consumer|cancel)$/);
      const definitionPath = match ? `/v1/tasks/{id}/${match[2]}` : path;
      const definition = definitions.find(([m, p]) => m === method && p === definitionPath);
      if (!definition || method !== 'POST') throw new Fault(404, 'not_found', 'Route not found.');
      const body = await readBody(req); validate(body, definition[2], definition[3]);
      const result = store.mutation(account.id, path, req.headers['idempotency-key'], body, () => {
        if (path === '/v1/presence') return store.market.presence(account.id, body);
        if (path === '/v1/whitelist') return store.market.setWhitelist(account.id, body);
        if (path === '/v1/workers') return store.registerWorker(account.id, body);
        if (path === '/v1/tasks') {
          if (body.workspace_required !== undefined && typeof body.workspace_required !== 'boolean') throw new Fault(400, 'invalid_input', 'workspace_required must be boolean.');
          const task = store.createTask(account.id, body);
          store.run('INSERT INTO task_workspaces(task,required) VALUES(?,?)', task.id, body.workspace_required ? 1 : 0);
          return task;
        }
        const [, taskId, action] = match;
        if (action === 'claim') { const task = store.claim(account.id, taskId, body.worker_id); return { ...task, workspace_required:!!store.one('SELECT required FROM task_workspaces WHERE task=?',task.id)?.required, tool_token: mintToolCap(store, task) }; }
        if (action === 'heartbeat') return store.heartbeat(account.id, taskId, body.epoch);
        if (action === 'abort-unsafe') return store.market.abortUnsafeTask(account.id, taskId, body);
        if (action === 'submit') { const task = store.submit(account.id, taskId, body); bindSubmission(store, taskId, body); return store.task(account.id, taskId); }
        if (action === 'judge') return store.market.judgeTask(account.id, taskId, body);
        if (action === 'accept') return store.accept(account.id, taskId, body);
        if (action === 'rate-consumer') return store.market.rateConsumer(account.id, taskId, body);
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
  const host = process.env.AWC_HOST || 'localhost', port = Number(process.env.AWC_PORT || 5003);
  const server = createServer(store, { allowedHosts: (process.env.AWC_ALLOWED_HOSTS || '127.0.0.1,localhost,[::1]').split(',') });
  const timer = setInterval(() => { try { store.sweep(); } catch { console.error('Task expiry sweep failed.'); } }, 5000);
  timer.unref();
  server.listen(port, host, () => {
    const urlHost = host.includes(':') ? `[${host}]` : host;
    const baseUrl = `http://${urlHost}:${server.address().port}`;
    console.log(`AI Work Company reference server: ${baseUrl}`);
    console.log(`Front end: ${baseUrl}/`);
    console.log(`Company market: ${baseUrl}/company/`);
    console.log(`Dashboard: ${baseUrl}/admin/`);
    console.log(`Agent contract: ${baseUrl}/agent.md`);
    console.log(`OpenAPI spec: ${baseUrl}/openapi.json`);
  });
  const stop = () => { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
