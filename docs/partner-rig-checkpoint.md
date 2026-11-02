# Partner character rig checkpoint

2026-11-02: paused at the owner's request.

Eight generated adaptations of the partner character designs now use the existing
Haqi pipeline: separate 16-view heads and 7-by-4 bodies (six walking frames and
one idle frame in each direction). Each WebP is under 200,000 bytes. Permanent
Keepwork CDN downloads were checked against SHA-256 and CORS headers. Local
copies and geometry are in the synced persona catalogue; renderer code is unchanged.
Generation prompts are saved in `site/assets/avatars/rig-prompts.json`.

These are generated adaptations, not original animation sheets copied from
AINiangAssets. The original imported artwork remains in `site/assets/ainiang/`.

Outstanding: `sprite-lab.js` still displays the old combined portrait sheet.
Unify its portraits with the new character portraits used by `world.js`.
Restart the local server and visually verify the new animated rigs in every
direction before calling the replacement complete. The existing server may
still serve its startup snapshot. No US server deployment was performed.

Canonical preparation changes remain in the local ignored Haqi checkout;
the downstream manifest, textures and exact provenance are committed here.
