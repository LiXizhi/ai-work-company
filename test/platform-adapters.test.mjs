import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPrivateDirectory, assertPrivateFile } from '../worker/platform.mjs';
import { runAdapter } from '../worker/run.mjs';
import { validatePolicy } from '../worker/continuous.mjs';
import { validateCommandAdapterConfig } from '../worker/adapters/command.mjs';

test('platform private path checks enforce 0700/0600 on POSIX, tolerate win32 NTFS mode bits, and reject symlinks everywhere', async () => {
  const root = await mkdtemp(join(tmpdir(), 'awc-platform-'));
  const privDir = join(root, 'priv');
  await assertPrivateDirectory(privDir, { platform: 'darwin' });
  await assertPrivateDirectory(privDir, { platform: 'win32' });

  if (process.platform !== 'win32') {
    await chmod(privDir, 0o755);
    await assert.rejects(assertPrivateDirectory(privDir, { platform: 'linux' }), /client_directory_must_be_private/);
    await assertPrivateDirectory(privDir, { platform: 'win32' });
    await chmod(privDir, 0o700);
  }

  const file = join(privDir, 'state.json');
  await writeFile(file, '{"ok":true}', { mode: 0o600 });
  await assertPrivateFile(file, { platform: 'darwin' });
  await assertPrivateFile(file, { platform: 'win32' });

  const sym = join(root, 'link-state.json');
  await symlink(file, sym);
  await assert.rejects(assertPrivateFile(sym, { platform: 'darwin' }), /unsafe_client_state/);
  await assert.rejects(assertPrivateFile(sym, { platform: 'win32' }), /unsafe_client_state/);
});

test('claude and command Worker adapters isolate tools, avoid shells, and tag evidence_kind honestly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'awc-adapters-'));
  const fakeClaude = join(root, 'fake-claude.mjs');
  await writeFile(fakeClaude, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (!args.includes('--print') || !args.includes('--strict-mcp-config') || args[args.indexOf('--tools') + 1] !== '') {
  process.stderr.write('missing strict flags');
  process.exit(2);
}
const prompt = readFileSync(0, 'utf8');
process.stdout.write(JSON.stringify({
  structured_output: { result: 'Claude adapter output for ' + (prompt.includes('hanzi-story-animation') ? 'hanzi' : 'task') },
  usage: { input_tokens: 120, cache_read_input_tokens: 30, output_tokens: 45 }
}));
`, { mode: 0o700 });

  const previousClaude = process.env.AWC_CLAUDE;
  process.env.AWC_CLAUDE = fakeClaude;
  try {
    if (process.platform !== 'win32') {
      const claudeRes = await runAdapter({
        adapter: 'claude',
        base: 'http://127.0.0.1:5003',
        lease: {
          id: 'task_00000000-0000-4000-8000-000000000001',
          model: 'claude-opus-5.5',
          title: 'Hanzi Mountain',
          description: '6 shots',
          category: 'art_works',
          skill_id: 'hanzi-story-animation',
          workspace_required: false,
        },
        runDir: join(root, 'claude-run'),
      });
      assert.equal(claudeRes.result, 'Claude adapter output for hanzi');
      assert.equal(claudeRes.evidence_kind, 'local_claude_cli_observation');
      assert.deepEqual(claudeRes.usage, {
        input_tokens: 150,
        cached_input_tokens: 30,
        cache_write_input_tokens: 0,
        output_tokens: 45,
      });
    }
  } finally {
    if (previousClaude === undefined) delete process.env.AWC_CLAUDE;
    else process.env.AWC_CLAUDE = previousClaude;
  }

  const fakeRunner = join(root, 'json-runner.mjs');
  await writeFile(fakeRunner, `import { readFileSync } from 'node:fs';
const req = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({
  result: 'Custom runner completed: ' + req.task_id,
  usage: { input_tokens: 80, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 25 }
}));
`);

  assert.throws(() => validateCommandAdapterConfig({ executable: 'relative/bin' }), /must_be_absolute/);
  const cmdRes = await runAdapter({
    adapter: 'command',
    commandConfig: { executable: process.execPath, args: [fakeRunner] },
    base: 'http://127.0.0.1:5003',
    lease: {
      id: 'task_00000000-0000-4000-8000-000000000002',
      model: 'gpt-6-astra',
      title: 'Poly Fox',
      description: 'Code3D fox',
      category: 'general_files',
      skill_id: 'poly-code3d-art',
      workspace_required: false,
    },
    runDir: join(root, 'cmd-run'),
  });
  assert.equal(cmdRes.result, 'Custom runner completed: task_00000000-0000-4000-8000-000000000002');
  assert.equal(cmdRes.evidence_kind, 'unverified_custom_adapter');

  const now = Date.now();
  const basePolicy = {
    version: 1,
    server: 'http://localhost:5003',
    worker_id: 'worker_00000000-0000-4000-8000-000000000099',
    model: 'claude-opus-5.5',
    adapter: 'claude',
    expires_at: new Date(now + 60_000).toISOString(),
    windows: [{ start: new Date(now).toISOString(), end: new Date(now + 60_000).toISOString() }],
    categories: ['art_works'],
    max_attempts_per_window: 3,
  };
  assert.equal(validatePolicy(basePolicy, 'http://localhost:5003').adapter, 'claude');
  assert.throws(() => validatePolicy({ ...basePolicy, adapter: 'shell' }, 'http://localhost:5003'), /invalid_policy_adapter/);
  assert.throws(() => validatePolicy({ ...basePolicy, adapter: 'command' }, 'http://localhost:5003'), /invalid_command_adapter/);
});
