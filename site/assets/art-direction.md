# Current asset ownership

Runtime heads/bodies are shared HaqiCombatSim WebPs. Canonical catalogue and
anchors live upstream in `data/hero-preview.json`; this app imports a subset with
`scripts/sync-haqi.mjs`. The PNG atlases and illustrated background discussed below
are historical generation inputs, no longer shipped as runtime character assets.
Detailed portrait UI art remains `persona-portraits.png`.

# World preview art

Generated with the built-in imagegen tool on 2026-10-22. Original fictional
personifications; not official vendor characters or provider identity evidence.
The scene and the transparent four-character atlas are separate runtime assets.

## Environment prompt

Create a premium game environment background illustration, landscape 1536x1024, no text no letters no UI no characters. A bright warm futuristic miniature floating city INSIDE a collective artificial brain. Isometric 3/4 overhead 2.5D game art, exquisite hand-painted 3D clay-like architecture, cream white ceramic, pale teal glass, coral accents, golden morning light, soft ambient occlusion, dreamy pale mint atmosphere. Composition: a LARGE open oval cream stone plaza in center foreground, radial glowing cyan neural paths. Around plaza: left a welcoming little peach roof recruitment station, rear left a tall ivory observatory with teal glass dome, rear center a magnificent branching glowing neural tree with golden memory orbs, rear right a round glass greenhouse library, right a coral-roof cozy workshop with holographic screens. Small satellite floating islands at edges with tiny cottages, bridges, planter beds and bonsai trees. Island has thick layered rounded cutaway edge with trailing roots and glowing circuitry. Rich charming detail, coherent perspective, generous walkable open spaces center and lower center for separately overlaid characters. Airy ivory background, no dark space. Professional cozy social simulation game environment, high-end concept illustration, not a wireframe or schematic. Full island comfortably within frame, scenic objects concentrated from x 200 to 1350 and y 180 to 850.

## Avatar atlas prompt

Create one game character sprite atlas on genuinely transparent background, wide landscape image. EXACTLY FOUR separate full body characters in ONE horizontal row, equal-sized cells, each centered in their quarter with generous clear gap, heads and feet aligned, entire body visible, no text, no ground plane. Original anthropomorphic AI vendor avatars, charming premium anime chibi adults with 2.8-head-tall proportions, sophisticated painterly 3D cel-shaded game art, 3/4 view facing slightly toward camera, soft upper-left light, delicate fabric details and expressive large eyes. Left to right: 1 GPT ASTRA: androgynous star explorer, short ivory hair, teal eyes, white and seafoam futuristic long coat with gold star clasp, floating tiny green star by shoulder, dark teal boots; 2 CLAUDE: gentle dove scholar, fluffy peach auburn hair, warm amber eyes, ivory feather shoulder cape, terracotta waistcoat and cream trousers, holding small closed book, little white dove motif brooch; 3 DEEPSEEK: blue whale-inspired young ocean engineer, navy tousled hair with cyan tips, blue eyes, blue and cream sailor engineering coat, whale-tail scarf end, utility satchel, holding tiny luminous aqua whale hologram; 4 GEMINI: twin-star creative, lilac bob hair, violet and gold eyes, asymmetric lavender and periwinkle jacket, paired gold star hairpins, cream shorts and violet boots, two tiny orbiting star ornaments. Friendly standing idle poses with hands naturally arranged. Cohesive art direction, polished faces, attractive silhouettes readable at 100px. Transparent background, no labels, no borders, no overlap between characters.

## Current Haqi-compatible personas

Generated with the built-in image_gen tool from `docs/ai-model-personas.md`.
Detailed selection art: `persona-portraits.png`. Runtime assets: `personas/{astra,claude,deepseek,gemini}-{head,body}.png`, eight independent transparent textures.
Exact generation prompts: [personas/prompts.json](personas/prompts.json).
The head atlas is 4 × 4 (16 yaw directions); each body is 7 × 4
(six walk frames and one idle frame for front, left, right and back).
`personas/manifest.json` supplies the unchanged Haqi renderer with measured crops,
neck anchors and file hashes. Artwork is unofficial persona fan art; it does not
claim provider endorsement or verified model identity. The earlier combined avatar
atlases described above were superseded and are not shipped.

## Live terrain replaces the illustrated backdrop

The homepage no longer loads `world-city.png`. Terrain is painted by Haqi's
original scene renderer; building/tree textures are copied byte-for-byte from
HaqiCombatSim, with source metadata and hashes in `haqi-scene.json`. No new images
were generated for this change. The renderer's world-space objects share depth
sorting and collision geometry with the animated residents.
