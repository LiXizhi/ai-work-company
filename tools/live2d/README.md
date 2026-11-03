# Local Live2D art pipeline

An offline **AI art preparation and native Live2D build** tool for full-body characters,
including standing and breathing. The [native pipeline](native-pipeline.md) now
automatically rigs registered humanoid parts and verifies the exported MOC3 in Core.
Arbitrary images still need generated/repaired parts and reviewed registration.
It does not add a second game renderer, change Haqi assets or expose any server API.
Inputs and generated/private artwork should stay in ignored `tmp/` or outside Git.

**Preferred Codex workflow:** give Codex a reference image or text design and follow
[Codex-driven generation](codex-generation.md). Codex uses built-in imagegen to
generate the reference/transparent parts, inspects and repairs them, then runs
`import-atlas` and `build`. The polygon editor below is an optional repair tool.
Generated art still requires reviewed registration. Use the native builder for
the tested basic rig, or the Cubism handoff for more detailed manual authoring.

## Setup (Windows PowerShell, repository root)

```powershell
python -m venv tmp/live2d-venv
tmp/live2d-venv/Scripts/python -m pip install -r tools/live2d/requirements.txt
```

On macOS/Linux use `tmp/live2d-venv/bin/python` instead. Python 3.10+ is required.
Python dependencies are development art tools; the Node runtime is unchanged.

## Start with an image

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/pipeline.py init C:/art/character.png --out tmp/my-character
```

Open `tmp/my-character/editor.html` in a browser. It is self-contained and makes
no network requests. Click polygon boundaries around parts, name them, and save.
Reorder parts back-to-front. Download `project.json` and put it beside `source.png`,
replacing the initial project file. You can reopen a saved JSON in the editor.
An imported PNG layer is listed but its separate pixels are not editable there;
the editor shows the reference composite and polygon outlines only.

Start with a full-body neutral pose, visible hands/feet and uncluttered background.
JPG, PNG and WebP work through Pillow; photographic and non-human subjects need
their own part anatomy and parameter plan. The tool does not infer skeletons,
segment semantically, remove backgrounds, or invent hidden artwork automatically.
An opaque image needs a tightly traced silhouette; background inside a polygon
will otherwise stay in the cutout. Transparent source images are easier to use.

Masks preserve original visible pixels and canvas registration. They cannot supply
the torso behind an arm, the scalp behind hair, closed eyelids, or the mouth interior.
For those, paint or use an image editor/generator to create transparent replacement
PNGs, inspect them, then replace a layer's `polygon` with:

```json
{"id":"torso","image":"parts/torso-repaired.png","offset":[120,340],"visible":true,"repair_reviewed":true}
```

Offsets are integer pixels from the source canvas top-left. Replacement PNGs may
be cropped or full-canvas. Paths are local and relative to `project.json`; URLs and
paths outside the project are rejected. Unique ASCII IDs become PSD layer names.
Use `visible:false` for alternate poses. Mark repairs reviewed only after inspection.
Keep named layers for chest/torso, upper/lower arms and hands, legs/feet, face,
eye/mouth parts, front/back hair and accessories as appropriate to the character.

Suggested AI-assisted repair brief (the tool does not submit it to a provider):
“Preserve this character's identity, outfit, pose, palette, linework and exact
canvas coordinates. Reconstruct only the missing portion of [part] hidden behind
[occluder]. Output that complete isolated part on transparency; retain overlap
under adjacent parts. Do not redesign, re-pose, rescale or bake shadows from the
occluder into this part.” Check alignment and alpha edges before accepting it.

## Build the handoff

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/pipeline.py build tmp/my-character/project.json --out tmp/my-character-build
```

Output folders must be new; existing work is never silently overwritten. Outputs:

- `character.psd`: named, positioned, transparent pixel layers; reopened and checked
  for exact layer pixels, positions and visibility. Cubism import still needs testing.
- `reference.png`, `composite.png`, extracted `parts/`, and `report.json`.
- Six independent `motion-templates/`: standing/breathing, head tilt, wave,
  accessory sway, blink, talk. These are **unbound parameter curves**, not geometry.
- `parameters.json` with suggested ranges and `CUBISM-HANDOFF.md` with rigging/QA steps.

The four-second breathing loop only animates `ParamBreath`. Keep feet planted,
bind subtle expansion to the chest/upper torso, and combine with arm/accessory
motions after rigging. It does not resize or bob the whole character.

## Continue from a layered PSD

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/pipeline.py import-psd C:/art/character.psd --out tmp/imported-character
tmp/live2d-venv/Scripts/python tools/live2d/pipeline.py build tmp/imported-character/project.json --out tmp/imported-build
```

This importer targets flat raster pixel layers. Groups and adjustment layers are
rejected; rasterize effects/masks in the source editor before import. It is not a
general Photoshop converter. The initial Claude chibi example uses the existing
12-layer PSD; its entire-head blink/talk replacements are not independent face rigs.

## Cubism export gate

Import the PSD, create ArtMeshes/deformers, bind the parameter ranges, create an
atlas, and export a model in Cubism. Detailed steps are in [handoff.md](handoff.md).
After registering motions in the model descriptor:

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/pipeline.py check-export C:/art/export/character.model3.json
```

This checks referenced files, JSON parseability, texture decoding and the MOC3
signature. It **cannot** prove that binary model data is valid or parameters are
bound. `runtime_verified` deliberately stays false, even after a file preflight
passes. Load the actual model in Cubism Viewer/the target SDK for visual acceptance.
`build_native.py` adds a separate Core loading and deformation test beyond this
file-only preflight. There is no committed Cubism Core or native editor automation.

## Validation

```powershell
tmp/live2d-venv/Scripts/python -m unittest discover -s tools/live2d -p "test_*.py"
```

Synthetic tests cover single-image masks and alpha, hidden layer/PSD roundtrip,
breath loop metadata, missing textures, path containment and overwrite refusal.

Official workflow references:
- [PSD preparation/import](https://docs.live2d.com/en/cubism-editor-manual/psd-import/)
- [Runtime export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)
- [psd-tools editing API](https://psd-tools.readthedocs.io/en/latest/usage.html)
