import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Store} from '../backend/store.mjs';
import {createServer} from '../backend/server.mjs';
import {Api} from '../worker/client.mjs';

test('prefixed deployment preserves portal links, client requests, auth and idempotency', async t => {
  const store = new Store(), backend = createServer(store);
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const prefix = '/ai-work-company';
  const proxy = http.createServer((req, res) => {
    if (!req.url.startsWith(prefix + '/')) { res.writeHead(404); res.end(); return; }
    const upstream = http.request({hostname:'127.0.0.1',port:backend.address().port,path:req.url.slice(prefix.length),method:req.method,headers:req.headers}, reply => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(r=>proxy.close(r)); await new Promise(r=>backend.close(r)); store.close(); });
  const base = `http://127.0.0.1:${proxy.address().port}${prefix}`;
  for (const page of ['company/','free/','admin/']) {
    const url = base + '/' + page, response = await fetch(url);
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const [,link] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (!link.startsWith('../')) continue;
      const target = new URL(link, url);
      assert.ok(target.pathname.startsWith(prefix + '/'));
      assert.equal((await fetch(target)).status, 200, target.href);
    }
  }
  const registration = await fetch(base + '/v1/accounts', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Synthetic deployment owner'})});
  assert.equal(registration.status, 200);
  const account = await registration.json(), api = new Api(base + '/', account.token);
  assert.equal(api.base, base);
  assert.equal((await api.request('/v1/me')).spendable_minor, 0);
  const body = {title:'Synthetic prefix check',description:'In-memory only',public:true};
  const first = await api.request('/v1/free-tasks', body, 'prefix-one');
  assert.equal((await api.request('/v1/free-tasks', body, 'prefix-one')).id, first.id);
  assert.equal((await api.request('/v1/free-tasks')).items.length, 1);
  assert.equal((await fetch(base + '/v1/me')).status, 401);
  assert.equal((await fetch(base + '/v1/market',{headers:{Origin:'https://foreign.invalid'}})).status,403);
  const spec = await (await fetch(base + '/openapi.json')).json();
  assert.equal(new URL(spec.servers[0].url,base+'/openapi.json').href, base+'/');
});
