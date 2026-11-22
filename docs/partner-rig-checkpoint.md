# Partner character rig checkpoint

2026-11-22: unified `sprite-lab` and `world` partner portraits via `site/personas.mjs`.

Eight generated adaptations of the partner character designs use the existing
Haqi pipeline: separate 16-view heads and 7-by-4 bodies (six walking frames and
one idle frame in each direction). Each WebP is under 200,000 bytes. Permanent
Keepwork CDN downloads were checked against SHA-256 and CORS headers. Local
copies and geometry are in the synced persona catalogue; renderer code is unchanged.
Generation prompts are saved in `site/assets/avatars/rig-prompts.json`.

These are generated adaptations, not original animation sheets copied from
AINiangAssets. The original imported artwork remains in `site/assets/ainiang/`.

`site/personas.mjs` now supplies the shared WebP portrait mapping (`gpt.webp`,
`claude.webp`, `deepseek-chibi.webp`, `gemini.webp`) to both `site/world.js`
and `site/sprite-lab.js`, replacing the legacy combined portrait sheet on the
diagnostic page. Restart any previously running local server before visually
checking updated assets.

Canonical preparation changes remain in the local ignored Haqi checkout;
the downstream manifest, textures and exact provenance are committed here.
