# Working on AI Work Company

Read README.md and docs/implementation.md before editing. Full product proposals
live in docs/design; do not describe them as shipped features.

- Website, machine-readable contracts and backend stay in this repository.
- Prefer small, dependency-light modules. Runtime is Node.js 24, SQLite and HTTP.
- Money is integer minor units (100 = 1 work credit); never floating point.
- Account creation and unpaid trial never mint consumer spending credit.
- All mutations of task state and money must be transactional and idempotent.
- Worker claims and model names are untrusted. No automatic model-certification claim.
- Do not add host shell, filesystem, MCP forwarding or payment endpoints without
  implementing and testing the corresponding boundaries in docs/design/security.md.
- No secrets, personal notes, live databases, real customer data or test credentials
  in commits. Keep synthetic fixtures in memory or an ignored temporary directory.
- Run npm test and npm run build:site after protocol or backend changes.
- Update the OpenAPI contract and agent.md with behavior changes. Pages is a static
  documentation site, never a live marketplace backend.

## HaqiCombatSim is the shared world engine and art source

- AI Work Company consumes a subset of `HaqiCombatSim` in
  `https://github.com/LiXizhi/HaqiWebTools` (`HaqiCombatSim/`). Do not maintain a
  parallel character, animation, scene, navigation or home-land engine here.
- Heads and bodies are independent reusable catalogue items. The canonical
  renderer is upstream `js/hero_renderer.js`; canonical textures, neck/foot
  anchors and variants live in upstream `data/hero-preview.json` and
  `assets/hero-preview/`. Both apps use the same renderer bytes and art bytes.
  Fix shared geometry/animation upstream, test there, then sync here. Do not add
  app-local drawing offsets, renderer copies, source-string patches or recolors
  to compensate for an upstream issue.
- `config/haqi-subset.json` declares the subset. Run
  `npm run sync:haqi -- /path/to/HaqiCombatSim` (or set `HAQI_SOURCE`). On a new
  machine use `npm run sync:haqi -- --clone`; its isolated checkout is under
  ignored `tmp/haqi-upstream`. Existing checkouts are never automatically pulled
  or reset. Choose/review an upstream revision explicitly before refreshing.
- `npm run check:haqi -- /path/to/HaqiCombatSim` checks source, data and art parity.
  `site/vendor/haqi/provenance.json` records the repository commit plus exact file
  hashes, including local upstream edits. Generated vendored files are read-only:
  no manual changes. Normal builds do not require the upstream checkout/network.
- To reuse more systems (including homes/land), read Haqi's applicable instructions
  and module contracts first, extend the subset config's `entries`/`data` and art
  selections, then sync. Keep company-specific policy, tasks, money, permissions
  and UI orchestration outside the shared renderer. Never import Haqi gameplay
  rewards, login or storage side effects into the marketplace implicitly.
- Agent behavior is autonomous by default. User-directed movement is an explicit,
  bounded override, after which autonomy resumes; it must use the same shared
  navigation and collision rules. Do not turn the world into a player-led RPG.
  Current wandering/social gestures are local simulations, not model inference.
  Real autonomous governance, home-land persistence and user movement commands
  must be documented/tested as implemented before claiming they are shipped.
- After shared changes, run the relevant upstream regression tests, subset parity
  check, `npm test` and `npm run build:site`. Respect upstream asset budgets/CDN
  publication rules; do not publish the whole Haqi game as part of an asset sync.
