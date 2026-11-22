// Zero-dependency leaf module executed immediately while the main module graph streams.
const json = (rel) => fetch(new URL(rel, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const preferCdn = typeof location !== 'undefined' && !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const warmImages = [];
function warmCdn(url) {
  if (!preferCdn || !url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  warmImages.push(img);
}
const personas = json('./assets/personas/manifest.json').then((m) => {
  if (m && preferCdn) {
    warmCdn(m.bodies?.['female-walk']?.cdn);
    for (const id of ['astra', 'claude', 'deepseek', 'gemini']) {
      warmCdn(m.heads?.[id]?.cdn);
      warmCdn(m.bodyVariants?.['female-ai-' + id]?.cdn);
    }
  }
  return m;
});
const scene = json('./assets/haqi-scene.json').then((m) => {
  if (m && preferCdn) warmCdn(m.atlases?.campTrees?.cdn);
  return m;
});
globalThis.__awcBoot = {
  personas,
  scene,
  catalog: json('./vendor/haqi-data/data/adventure/home/catalog.json'),
  city: json('./vendor/haqi-data/data/adventure/neural-city-art.json'),
  warmImages,
};
