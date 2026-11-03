# Live2D source review — 2026-11-03

Architectural/source review, not a benchmark or a claim to have run these projects.
Checkouts are retained in ignored `tmp/research-*`. No GPL source was copied into
our rig implementation. Observations below distinguish applied changes from ideas.

## image-to-live2d

https://github.com/lvhaojie456/image-to-live2d
Revision: `3c32db19ad28e60d5da84399792f960c4a524043`.
Read pipeline/supervisor docs, `scripts/visual_repair.py`, and body-motion entry points.

- Register all parts to the source canvas. Its expression edits restore pixels
  outside the mask and independently register eye/mouth crops. Our independently
  scaled atlas cells cannot promise identity or joint alignment.
- Separate structural validity from appearance. Bounded repairs retain the best
  candidate, protect identity and visible motion, and can return `needs_review`.
- Inspect exported-model combined extremes and facial closeups. A synchronized
  sine sweep misses opposing extremes.
- Only regions in its vision plan are consumed downstream; other planning fields
  are advisory. A generated layer plan does not mean every item is rigged.

Applied: exhaustive pose corners, triangle-area checks, retained iterations.
Automated visual repair/acceptance is still not implemented here.

## PSD2Live

https://github.com/tsunehimatoi/psd2live
Revision: `bafabab1a360e208671d39adf5087c62f6cae1f2`.
Read README, `core/NinePoseFaceRig.kt`, `core/SkeletonJointTemplates.kt`, and
`core/quality/SkeletonBindingQuality.kt`.

- A mesh can have a valid binding but bypass the torso. Check which meshes each
  parameter moves and which parent deformers they inherit.
- Elbow/knee deformation needs joint geometry and mixed weights, preserving rigid
  limb sections. Disconnected rectangular part rotation is insufficient.
- Face turning combines a broad face warp, feature-specific corrections and corner
  interaction terms. Whole-head rotation is not face rigging.
- Its editable CMO3 export is a potential backend. It is GPL-3.0 and is not vendored.

Applied: common breathing parent, child head/arm/accessory warps and native geometry
verification. Joint skinning, face rigs and CMO3 remain future work.

## See-through

https://github.com/shitagaki-lab/see-through
Revision: `df019de5129d6c4b406587a14c3501669441a783`.
Read README and `inference/scripts/inference_psd.py`; inspected depth ordering and
left/right splitting in `common/utils/inference_utils.py`.

- Complete occluded pixels, rather than only segmenting visible pixels. Those
  hidden regions become visible when a limb moves.
- Preserve bounds and common canvas registration. Depth plus semantic corrections
  determine order. Individually resizing contact-sheet cells loses that relation.
- Decomposition, depth and PSD extraction are separate cacheable stages. Our PSD
  importer can accept external decomposition without replacing the native writer.

Not run here; model inference/weights are not installed. Fixed semantic body classes
will not automatically cover arbitrary accessories or unusual anatomy.

## Bunraku

https://bunraku-live2d.github.io/
https://github.com/SparcAI-Inc/Bunraku
Revision: `b9cc79049a50e36b1ba10db6140edb166f500e4e`.
Read project description and repository README; no implementation is published in
this checkout.

- Describes completed ordered RGBA layers and per-vertex displacement prediction
  on alpha-derived meshes. An accessory need not fit a fixed human semantic class.
- Reports separation when combining more predicted motion fields. Test combinations
  instead of accepting isolated sliders.
- Alpha-preserving recoloring can retain meshes and motion. Version texture,
  topology and animation independently.

These are lessons from the authors' description, not locally reproduced results.

## Our iteration

The marked shoulder gaps exposed registration and hierarchy problems. Originally
only the torso changed during breathing. A shared body lattice now drives eight
upper-body meshes, with head/arm/accessory children; legs remain fixed. The writer's
local extension resolves nested warp parents (see vendor attribution). Child grids
use parent-local lattice coordinates.

Private builds/art remain in ignored tmp folders. v4 moved arms inward but hid hands
behind the skirt. v5 reduces that translation and draws forearms above the torso.
Native checks cover 121 cycle samples, 32 extreme combinations, neutral registration
and signed triangle areas. They do not prove every visible seam is fixed.

Next: registered full-canvas generation/decomposition and measured joint anchors;
independent eyes/mouth with identity-preserving edits; elbow deformation, secondary
physics and an evaluated CMO3 backend. Visual acceptance remains separate from
runtime validity. No universal-quality or superiority claim is made.
