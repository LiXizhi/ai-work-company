# Joint-aware assembly

`assemble.py` replaces independent placement nudges with a constraint graph.
It does not detect anatomy: Codex or an artist must inspect each part and supply
local-pixel landmarks. The solver derives offsets, rig pivots and back-to-front
ordering automatically. Raster files are copied unchanged.

Prefer continuous arms when there is no independent elbow rig. Split sleeves
need hidden fabric overlap, without hollow tube ends, ellipse cuts or extra cuffs
at the elbow. Geometry cannot remove painted seams; repair those with imagegen.

## Recipe

IDs match `project.json`. Coordinates refer to cropped part images, not the canvas.
The root and unattached layers retain their original positions. Example only:

```json
{
  "root": "torso",
  "landmarkSource": "Codex visual inspection of part PNGs",
  "attachments": [{
    "parent": "torso", "child": "arm-left",
    "parentAnchor": [180, 82], "childAnchor": [174, 24],
    "effect": "leftArm", "degrees": 12, "radius": 12
  }],
  "frontOf": [["arm-left", "torso"]]
}
```

Measure each character's actual landmarks; do not reuse these example numbers.
`inheritPivot: true` gives a child its parent's rig pivot and effect. A forearm
then follows shoulder rotation; this does not create independent elbow bending.
Head ornaments can similarly follow head tilt. Set `checkCoverage: false` only for
positional followers that are not physical seams. They are explicitly omitted
from joint coverage and native seam tests.

The solver rejects unknown layers, duplicate attachments, cycles and invalid
coordinates. Within a disk around each checked joint, alpha >= 128 must cover 98%
of the disk in the union and 20% in both parts. Failure returns `needs_repaint`.
Passing returns `ready_for_pose_review`, never final visual acceptance.

## Build

```powershell
tmp/live2d-venv/Scripts/python tools/live2d/build_native.py input/project.json --assembly input/assembly.json --out tmp/native-result --core tmp/live2d-libs/live2dcubismcore.min.js --pixi tmp/live2d-libs/pixi.min.js --display tmp/live2d-libs/cubism4.min.js
```

Fitted source/reports go to `tmp/native-result-assembly`, then the native model to
`tmp/native-result`. Both must be new directories. Do not combine `--assembly` and
`--rig`: assembly derives the rig overrides. Coverage failure stops the build and
retains the report for localized repair.

`native-input.json` carries checked joints into Core verification. At all min/max
parameter combinations, the verifier interpolates the same attachment point on
parent and child surfaces; separation over 0.25 canvas pixels fails the build.
This tests points, not the full silhouette or painted seams. Inspect exported
animation in the browser too: both arm extremes, head tilt and breathing together.

Current continuous-sleeve example checks neck and both shoulders. The previous
split-sleeve iteration also checks both elbows. Neither has independent elbow
bending. Private source art and recipes remain in ignored `tmp/`.
