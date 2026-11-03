# Codex-driven image/text to Live2D workflow

Use this workflow when the user wants generated artwork, rather than manual masks.
Use the built-in imagegen skill/tool; a shell script cannot invoke that tool. Do not
require an API key or quietly switch to a paid API. The Python commands handle
deterministic packaging after Codex generates the art.

## Inputs

Accept either a reference image or a text design. Default target: full-body,
standing idle with breathing, head tilt, arm gesture and accessory movement.
For text input, generate a full-body neutral reference first. For image input,
inspect it; reconstruct cropped feet/hands in a separate reference revision if
needed. Preserve identity, outfit, proportions, palette and accessories. Keep
reference revisions and generated parts separate; do not overwrite source art.

## Generate parts

1. Inspect the source using `view_image`. Use it as the identity reference for
   built-in imagegen, requesting real transparent output.
2. Generate a parts atlas using [parts-prompt.txt](parts-prompt.txt). For non-human
   anatomy adapt the part list and layout explicitly. A humanoid layout is not a
   universal skeleton. Store the exact submitted prompt, reference hash and output
   path in the local project. Character names are not generator model identities.
3. Inspect the output. Regenerate a faulty part individually when required rather
   than repeatedly redesigning the full sheet. Part generation should reconstruct
   hidden regions and joint overlaps, not simply crop the visible source.
4. Check alpha, clipping, identity drift, limb completeness, sleeve duplication,
   matching left/right scales, inconsistent head variants, and unwanted backdrop.
   Grid positions are packaging hints; they do not guarantee semantic correctness.
5. Use `import-atlas` with a reviewed layout to split cells, place parts and build
   the PSD. This operation resizes/crops the generated raster for packaging; it is
   not a new renderer. Review `atlas-review.json` and the resulting composite.
   Reject clipped art or opaque backgrounds; clear geometric warnings alone are
   insufficient to approve the anatomy.

## Rig and animate

The generated handoff contains standing/breathing and gesture motion curves.
Only after the parts are bound to meshes/deformers can these move the model.
Use [native-pipeline.md](native-pipeline.md) for the tested automated baseline, or
[handoff.md](handoff.md) for manual Cubism authoring. Keep feet outside the chest breathing deformer.
Full-body poses require shoulder/elbow/wrist bindings and correct occlusion.

Whole-head expression swaps are acceptable only as a labelled prototype. For a
proper facial rig, separately generate/repair eyelids, eye whites, iris/pupil,
mouth interior and lips, then bind them. Never present an animated GIF, sprite
sheet, canvas preview or video as proof that a `.moc3` works.

Deliverable stages must stay explicit:
- Generated art draft: reference, parts, provenance and visual findings.
- PSD handoff: layered PSD, bindings plan and unbound motion templates.
- Native model: exported `.moc3`/`.model3.json`, textures and motions. The automated
  builder retains editable rig JSON; `.cmo3` requires separate Cubism authoring.
- Verified animation: native Viewer/SDK playback evidence for standing, breathing,
  arms and accessories. Without the native files, stop short of this claim.

## Example atlas import

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/pipeline.py import-atlas tmp/live2d-generated/parts-atlas-v1.png --layout tools/live2d/humanoid-layout.json --out tmp/generated-project
tmp/live2d-venv/Scripts/python tools/live2d/pipeline.py build tmp/generated-project/project.json --out tmp/generated-build
```

The bundled layout is a **starting registration for a chibi draft**, not an
automatic fit for any image. `box` is [left, top, width, height] in target canvas
pixels; `cell` is [column, row], zero-based. Parts fit within these boxes without
changing aspect ratio. Tune registration from the composite before native rigging.
Atlas registration uses alpha > 16/255 bounds plus a three-pixel margin to prevent
near-invisible generated speckles from changing part scale. This can trim faint
outer glow and is appropriate for solid cutout art, not translucent smoke/hair
effects. It does not clean the alpha of pixels retained inside that crop.
