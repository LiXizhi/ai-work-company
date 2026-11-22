import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

export function collectWorldModules(siteDir) {
  const seen = new Set();
  const ordered = [];
  function walk(absFile) {
    if (seen.has(absFile)) return;
    seen.add(absFile);
    const code = readFileSync(absFile, 'utf8');
    for (const [, spec] of code.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/g)) {
      const targetAbs = resolve(dirname(absFile), spec.split('?')[0]);
      if (targetAbs.startsWith(siteDir + '/') && existsSync(targetAbs)) walk(targetAbs);
    }
    ordered.push(relative(siteDir, absFile).replace(/\\/g, '/'));
  }
  const entryAbs = resolve(siteDir, 'world.js');
  if (existsSync(entryAbs)) walk(entryAbs);
  return ordered;
}

function compileSingleModule(relId, rawCode, siteDir) {
  const absFile = resolve(siteDir, relId);
  const exportsList = [];
  let code = rawCode.replace(/\bimport\.meta\.url\b/g, '__metaUrl');

  code = code.replace(/^\s*import\s+([\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]\s*;?/gm, (_, clause, spec) => {
    const depAbs = resolve(dirname(absFile), spec.split('?')[0]);
    const depId = relative(siteDir, depAbs).replace(/\\/g, '/');
    const trimmed = clause.trim();
    if (trimmed.startsWith('*')) {
      const ns = trimmed.replace(/^\*\s+as\s+/, '').trim();
      return `const ${ns} = __req(${JSON.stringify(depId)});`;
    }
    const inner = trimmed.replace(/^\{|\}$/g, '').split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
      const asMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      return asMatch ? `${asMatch[1]}: ${asMatch[2]}` : part;
    }).join(', ');
    return `const { ${inner} } = __req(${JSON.stringify(depId)});`;
  });

  code = code.replace(/^\s*export\s+(const|function\s*\*?|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    exportsList.push([name, name]);
    return `${kind} ${name}`;
  });

  code = code.replace(/^\s*export\s*\{([\s\S]*?)\}\s*;?/gm, (_, list) => {
    for (const part of list.split(',').map((s) => s.trim()).filter(Boolean)) {
      const asMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asMatch) exportsList.push([asMatch[2], asMatch[1]]);
      else exportsList.push([part, part]);
    }
    return '';
  });

  const getters = exportsList
    .map(([pub, loc]) => `${JSON.stringify(pub)}: { enumerable: true, get: () => ${loc} }`)
    .join(', ');
  return `__def(${JSON.stringify(relId)}, (__exports, __req, __metaUrl) => {\n${getters ? `Object.defineProperties(__exports, { ${getters} });\n` : ''}${code}\n});`;
}

export function buildWorldBundle(rootDir) {
  const siteDir = resolve(rootDir, 'site');
  const modules = collectWorldModules(siteDir);
  const fullScene = JSON.parse(readFileSync(resolve(siteDir, 'assets/haqi-scene.json'), 'utf8'));
  const bootData = {
    personas: JSON.parse(readFileSync(resolve(siteDir, 'assets/personas/manifest.json'), 'utf8')),
    scene: { ...fullScene, atlases: { campTrees: fullScene.atlases.campTrees } },
    catalog: JSON.parse(readFileSync(resolve(siteDir, 'vendor/haqi-data/data/adventure/home/catalog.json'), 'utf8')),
    city: JSON.parse(readFileSync(resolve(siteDir, 'vendor/haqi-data/data/adventure/neural-city-art.json'), 'utf8')),
  };

  const parts = [
    '// Generated single-request ES module bundle for World startup over HTTP/1.1 & HTTP/2.',
    `const __bootData = ${JSON.stringify(bootData)};`,
    `{
  const preferCdn = typeof location !== 'undefined' && !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const warmImages = [];
  const warm = (url) => {
    if (!preferCdn || !url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = url;
    warmImages.push(img);
  };
  if (preferCdn) {
    warm(__bootData.personas?.bodies?.['female-walk']?.cdn);
    for (const id of ['astra', 'claude', 'deepseek', 'gemini']) {
      warm(__bootData.personas?.heads?.[id]?.cdn);
      warm(__bootData.personas?.bodyVariants?.['female-ai-' + id]?.cdn);
    }
    warm(__bootData.scene?.atlases?.campTrees?.cdn);
    for (const item of __bootData.city?.homeItems || []) warm(item.art?.cdn);
  }
  globalThis.__awcBoot = {
    personas: Promise.resolve(__bootData.personas),
    scene: Promise.resolve(__bootData.scene),
    catalog: Promise.resolve(__bootData.catalog),
    city: Promise.resolve(__bootData.city),
    cityData: __bootData.city,
    warmImages,
  };
}`,
    `const __defs = new Map(), __cache = new Map(), __baseUrl = new URL('./', import.meta.url).href;
function __def(id, fn) { __defs.set(id, fn); }
function __req(id) {
  let mod = __cache.get(id);
  if (mod) return mod.exports;
  mod = { exports: {} };
  __cache.set(id, mod);
  const fn = __defs.get(id);
  if (!fn) throw new Error('Missing bundled module: ' + id);
  fn(mod.exports, __req, new URL(id, __baseUrl).href);
  return mod.exports;
}`,
  ];

  for (const relId of modules) {
    parts.push(compileSingleModule(relId, readFileSync(resolve(siteDir, relId), 'utf8'), siteDir));
  }
  parts.push('__req("world.js");\n');
  return parts.join('\n');
}

export function rewriteWorldIndexHtml(html, hashes) {
  return html
    .replace('href="ui-tokens.css"', `href="ui-tokens.css?v=${hashes.tokens}"`)
    .replace('href="world-ui.css"', `href="world-ui.css?v=${hashes.worldUi}"`)
    .replace('src="world.js"', `src="world.bundle.js?v=${hashes.bundle}"`);
}
