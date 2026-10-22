# Shared Haqi engine and art

HaqiCombatSim is the source of the renderer, animation, scene system and reusable
art catalogue. AI Work Company is a configured consumer, with its own marketplace
and autonomous-agent orchestration. No character placement adapter is maintained
in the company app: measured neck and sole anchors are consumed by Haqi itself.

## Refresh or verify

```sh
npm run sync:haqi -- /path/to/HaqiCombatSim
npm run check:haqi -- /path/to/HaqiCombatSim
# Or bootstrap the configured source repository into ignored tmp/:
npm run sync:haqi -- --clone
npm test
npm run build:site
```

`HAQI_SOURCE` is an alternative to the path argument. Clone uses the configured
repository/ref once; it never resets or pulls an existing checkout. To upgrade,
review and explicitly update the source checkout, then sync and inspect the diff.
Local source edits are allowed: the lock records HEAD and each actual file hash,
so an uncommitted upstream change cannot be mistaken for clean commit content.
Commit/push upstream and downstream separately when authorized.

`config/haqi-subset.json` owns the entrypoints, persona subset and scene atlases.
The sync traverses ES module imports and worker URLs, copies bytes unchanged,
selects the four head/body descriptors from the canonical catalogue and copies
referenced art with hash verification. Extra upstream JSON files can be listed
in `data`; they land under `vendor/haqi-data/`, with referenced local art copied.
Generated output membership and hashes are recorded in
`site/vendor/haqi/provenance.json`. The self-hosted server serves only those fixed
paths. Stale generated outputs are removed only if they still match their old hash.

The four personas are `astra`, `claude`, `deepseek`, `gemini`; body catalogue IDs
are `female-ai-<persona>`. Their heads are separately selectable in Haqi's picker.
Changing to a persona head suggests its matching body; bodies remain independent
choices. Both applications share transparent WebP files and frame geometry.

## Home-land system and autonomous/directed movement

AI Work Company reuses Haqi's home-land system (`home_core.js`, `home_walk_core.js`,
`home_building_core.js`, `home_building_templates_core.js`, `home_actions_core.js`,
`home_terrain_cache.js`, `home_building_cache.js`, `view_home_art.js`,
`view_home_building.js`, `home_store.js`, and `data/adventure/home/catalog.json`)
through the same `npm run sync:haqi` pipeline:

- Each of the four Agents (`astra`, `claude`, `deepseek`, `gemini`) has its own
  Haqi home (`createHome`, `applyHomeAction`, `validateHomePart`, `canPlace`) with
  doors, cutaway roofs (`roofSections`), roof decorations, indoor furniture, and
  courtyard items on the shared Home Land.
- Agents move autonomously by default between their own indoor spots, front yards,
  the central plaza, bridges, and neighbor visits using `findHomePath`,
  `stepHomeWalk`, `isHomePassable`, and `surfaceAtHome`, performing paired social
  gestures (`socialGesturePose`) when meeting.
- Users can select any Agent and click on the ground/houses/bridges (or use quick
  destination buttons) to give an explicit, bounded destination override
  (`directResident`). The Agent follows a collision-aware path, pauses briefly at
  the destination, and automatically resumes its autonomous routine.
- Real LLM social decisions, autonomous governance, and remote Keepwork home
  persistence remain unimplemented.

New upstream changes must be committed/pushed separately before a fresh remote
clone can consume them. While changes are local, use the explicit source path.

## Illustrated world map and neural-city art

The top-right map button uses Haqi's `adventure_ui_art.js` and original map
sprite from `ui-art.json`. Its modal uses the unchanged `DetailDialog` and
`createCloseButton`; company-specific landmark pins move the observer camera,
not an agent. Escape, backdrop dismissal and focus restoration come from Haqi.
The original city illustration is a WebP overview with authored landmark pins,
not a pixel-exact navigation mesh. Agents pause while a dialog is open.

`data/adventure/neural-city-art.json` is the upstream canonical catalogue for the
six independent native-alpha scenery WebPs and overview. Each is <=200,000 bytes,
has a verified permanent CDN URL, SHA-256 and source crop. Prompts and the spacing
revision are in upstream `art-references/neural-city-prompts.json` (built-in
`image_gen`). Subset sync includes this catalogue, UI catalogue and referenced
runtime art; source/additions provenance is not treated as runtime dependencies.

The city sprites also expose upstream `homeItems`. Company placement is in
`world-map-core.mjs`; it appends standard home objects to the existing catalogue,
so upstream drawing, depth grouping, tree suppression and pathfinding handle
these assets. Existing four homes remain intact. The upstream `applyUiIcon`
helper applies atlas coordinates without style injection for this app's CSP.
Verification: 92 company tests, static build, source parity, 30 character tests
and one upstream icon test pass; desktop/narrow map navigation and Escape checked.

### Ivory / gold / teal home theme

The shared Haqi home renderer now accepts `createHomeTerrainCache({theme:
'neural-city'})`, and modular catalogue items can set `building.theme` to the same
value. `view_home_neural.js` paints world-aligned marble, inlaid roads, teal canals,
marble bridges and matching building materials. Worker and fallback rendering
receive the same theme. Tree rendering optionally uses ivory planters and the
existing cypress/blossom WebP sprites. Default Haqi styling remains unchanged.
This changes presentation only: home footprints, water/bridge queries, door
opening, roof cutaway, furniture and autonomous/directed navigation are unchanged.
