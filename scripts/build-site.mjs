import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openapi } from '../backend/server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'site'), out, { recursive: true });
for (const report of ['business-model-analysis.html', 'business-model-analysis-v1.html']) {
  cpSync(resolve(root, 'docs', report), resolve(out, report));
}
writeFileSync(resolve(out, 'openapi.json'), JSON.stringify(openapi(), null, 2) + '\n');
writeFileSync(resolve(out, '.nojekyll'), '');
console.log('Built dist/: website, agent instructions, discovery and generated OpenAPI.');
