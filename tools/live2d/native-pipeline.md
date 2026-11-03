# AI art to animated native Live2D: tested humanoid baseline

Use [joint-aware assembly](assembly.md) to derive placement, draw order and pivots
from AI-reviewed landmarks, with paint-coverage and native attachment tests.

The current rig uses a common breathing parent with nested head, arm and accessory
warps. Native validation includes 121 cycle samples and all 32 min/max parameter
combinations with triangle orientation checks. `bodyBottom` and `bodyLift` in the
rig override JSON control the breathing envelope in canvas pixels. See
[source review](research-notes.md) for adopted techniques and remaining work.

The native path now goes beyond PSD handoff: it builds meshes and parameter-bound
warp grids, exports a real `.moc3`, loads it in Cubism Core, measures deformation,
and provides a browser viewer using pixi-live2d-display. No Cubism Editor is needed
for this limited rig. It does not create `.cmo3` projects; editable source is the
PSD, registration JSON, generated `rig-project.json` and optional rig overrides.

## 1. Generate art with Codex

Give Codex a reference image or text design and ask it to follow
[codex-generation.md](codex-generation.md). For text, generate a neutral full-body
reference first. Use built-in imagegen for the transparent parts and any repairs.
Store the actual prompts, references and hashes. Approve appearance separately
from checking file validity; imagegen can change identity or duplicate limbs.

## 2. Register the parts

Use `import-atlas` with `humanoid-layout.json`, or import an existing PSD. Layer
IDs drive the default rig: `torso`/`body`, `head`, `bow`, `arm...left`, `arm...right`,
`braid`/`accessory`, `leg-left`, `leg-right`. Keep unrelated parts static. The
default chibi registration must be adjusted for differently proportioned people.
The output `project.json` uses full-canvas pixel positions and transparent PNGs.

## 3. Set up local runtime dependencies once

Using the Python environment from [README](README.md):

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/setup_runtime.py --out tmp/live2d-libs
```

This fetches three pinned npm packages with install scripts disabled and keeps
only their viewer scripts, hashes and package integrity metadata. Core is Live2D
proprietary code despite the npm wrapper's ISC metadata. It stays in ignored local
output; no SDK binaries are committed or deployed. Use is subject to its included
license link; review redistribution terms before shipping outside local tooling.
You can instead supply your existing compatible Core/Pixi/display scripts.

## 4. Build and verify

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/build_native.py tmp/generated-project/project.json --out tmp/live2d-result --core tmp/live2d-libs/live2dcubismcore.min.js --pixi tmp/live2d-libs/pixi.min.js --display tmp/live2d-libs/cubism4.min.js
python -m http.server 5088 --bind 127.0.0.1 --directory tmp/live2d-result
```

Open http://127.0.0.1:5088/. A fresh output folder is required. Build fails if Core
rejects the model, vertices are nonfinite, the neutral pose differs from registered
art, a required parameter has no effect, or feet move under any tested parameter.
The code builds 8×8 grid meshes and 2×2 warp lattices. It exports five channels:

| Channel | Driven parts |
| --- | --- |
| `ParamBreath` (0..1) | chest/torso expansion, fixed lower edge |
| `ParamAngleZ` (-1..1) | head and hair bow, ±6° default |
| `ParamArmLZ` (-1..1) | left upper arm and forearm, ±12° |
| `ParamArmRZ` (-1..1) | right upper arm and forearm, ±12° |
| `ParamAccessorySwing` (-1..1) | braid/accessory, ±5° |

Angle parameters use normalized ranges in this model, not degree-valued standard
tracking inputs. Map tracker values accordingly. The viewer supplies bounded
parameter values to the native model; it does not animate raster cutouts itself.
The exported motion files use these same ranges. Feet stay outside all deformers.

Optional `--rig custom-rig.json` adjusts pivots/angles without editing source:

```json
{"parts":{"upper-arm-left":{"effect":"leftArm","pivot":[380,650],"degrees":8},"forearm-left":{"effect":"leftArm","pivot":[380,650],"degrees":8}}}
```

Both segments share a shoulder pivot for the current simple arm gesture. This is
not elbow IK or independently bent fingers. Pivot coordinates use canvas pixels.

## 5. Review and deliver

The result contains `character.moc3`, `character.model3.json`, textures, registered
motions, editable rig JSON, `core-verification.json`, `build-report.json`, and viewer.
Watch breathing for at least 30 seconds, then enable gestures. Inspect shoulder,
neck, wrist and braid overlaps and feet. Save browser evidence separately. Numeric
Core success is not approval of visual quality. Zip the model/texture/motion files
for another compatible runtime; include viewer libraries only under their terms.

Verified example on 2026-11-03: generated Claude parts, 10 visible meshes,
Cubism Core 4.2.2 loaded, all five channels move the expected geometry, both legs
remain fixed, neutral-coordinate error below 1e-7 model units. Browser rendering
and combined standing/breathing/gesture playback were checked locally.

Limits: humanoid baseline rather than universal semantic auto-rigging; one warp
channel per part; no cloth/hair physics, facial tracking, independent blink/mouth,
3D head turns, elbow IK, or native Cubism editor project export. Generated art
and joint overlaps still need review. Text-to-reference generation uses Codex's
built-in image tool and cannot be invoked by the standalone Python CLI.

The MIT-licensed MOC3 writer is attributed in [vendor/README.md](vendor/README.md).
