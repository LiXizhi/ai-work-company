import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('server startup prints reachable front end, company market, and dashboard URLs', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['backend/server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, AWC_DB: ':memory:', AWC_HOST: 'localhost', AWC_PORT: '0', AWC_ADMIN_TOKEN: '', AWC_ALLOWED_HOSTS: '127.0.0.1,localhost,[::1]' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  });
  let output = '';
  const urls = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited before startup: ${code}`)));
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const frontEnd = output.match(/^Front end: (http:\/\/localhost:\d+\/)$/m);
      const companyMarket = output.match(/^Company market: (http:\/\/localhost:\d+\/company\/)$/m);
      const dashboard = output.match(/^Dashboard: (http:\/\/localhost:\d+\/admin\/)$/m);
      const contract = output.match(/^Agent contract: (http:\/\/localhost:\d+\/agent\.md)$/m);
      const openapi = output.match(/^OpenAPI spec: (http:\/\/localhost:\d+\/openapi\.json)$/m);
      if (frontEnd && companyMarket && dashboard && contract && openapi) {
        resolve({
          frontEnd: frontEnd[1],
          companyMarket: companyMarket[1],
          dashboard: dashboard[1],
          contract: contract[1],
          openapi: openapi[1],
        });
      }
    });
  });
  assert.equal(urls.companyMarket, `${urls.frontEnd}company/`);
  assert.equal(urls.dashboard, `${urls.frontEnd}admin/`);
  assert.notEqual(new URL(urls.frontEnd).port, '0');
  for (const url of [urls.frontEnd, urls.companyMarket, urls.dashboard]) {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    await response.text();
  }
});
