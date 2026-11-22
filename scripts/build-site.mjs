import { buildDocs, documents } from './build-docs.mjs';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openapi } from '../backend/server.mjs';
import { buildWorldBundle, rewriteWorldIndexHtml } from '../backend/world-bundle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'site'), out, { recursive: true });
const bundleCode = buildWorldBundle(root);
writeFileSync(resolve(out, 'world.bundle.js'), bundleCode);
const ver = (buf) => createHash('sha256').update(buf).digest('base64url').slice(0, 10);
writeFileSync(resolve(out, 'index.html'), rewriteWorldIndexHtml(readFileSync(resolve(out, 'index.html'), 'utf8'), {
  tokens: ver(readFileSync(resolve(out, 'ui-tokens.css'))),
  worldUi: ver(readFileSync(resolve(out, 'world-ui.css'))),
  bundle: ver(Buffer.from(bundleCode, 'utf8')),
}));
buildDocs();
cpSync(resolve(root,'docs','report.css'),resolve(out,'report.css'));
for (const name of documents) for (const ext of ['md','html']) cpSync(resolve(root,'docs',`${name}.${ext}`),resolve(out,`${name}.${ext}`));
for (const name of ['business-model-analysis-v1.html', 'business-plan-v2.html', 'business-plan-v2.md']) cpSync(resolve(root, 'docs', name), resolve(out, name));
writeFileSync(resolve(out, 'openapi.json'), JSON.stringify(openapi(), null, 2) + '\n');
writeFileSync(resolve(out, '.nojekyll'), '');
console.log('Built dist/: website, agent instructions, discovery and generated OpenAPI.');
