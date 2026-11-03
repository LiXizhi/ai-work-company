# Cubism handoff: full-body standing and breathing

This package is layered art and parameter motion templates, not a playable model.
The PSD was reopened and its layer pixels, positions and visibility checked.
Native Cubism import and runtime playback have not been verified by the builder.

1. Compare `composite.png` with `reference.png`. Check missing/duplicated pixels,
   background fragments, shoulder/neck seams and layer order. Paint the body behind
   arms, scalp behind hair, and accessory overlaps. Split upper/lower arms, hands,
   eyes, eyelids, mouth and teeth when their movement requires it. Do not label a
   rectangular crop or a whole-head replacement as a finished facial rig.
2. Import `character.psd` into Cubism as a new model. Save a `.cmo3` project.
   Generate and inspect ArtMeshes, add warp/rotation deformers, and bind parameters.
   `parameters.json` gives suggested [minimum, default, maximum] values; adjust to
   anatomy. Custom arm/accessory parameters must be created explicitly.
3. Standing pose: establish ankle/foot contact at neutral, with the feet outside
   the breathing deformer. Keep leg length and sole position stable. Arms hang
   naturally; no whole-character scale animation or root bob is required.
4. Breathing: key `ParamBreath` from 0 to 1 on chest/upper-torso warp deformers.
   Start with roughly 1% chest expansion and a slight shoulder lift; inspect neck
   seams. The generated four-second loop rises smoothly from 0 to 1 and back to 0.
   It drives only breath, so other channels can be layered over it. A runtime's
   procedural breath controller must not fight this same parameter.
5. Arms: place shoulder, elbow and wrist pivots; bind `ParamArmLZ`/`ParamArmRZ`.
   The wave is a small test sweep, not automatic anatomical waving. Tune signs,
   ranges, occlusion and wrist/elbow poses to the character. Accessories use
   `ParamAccessorySwing`; optionally replace this with appropriate physics.
6. Bind head tilt, eye-open and mouth-open parameters to actual meshes. Test each
   parameter independently before importing the motion templates into animation.
   A character without eyes/mouth should omit those templates.
7. Create a texture atlas and export for runtime: `.moc3`, `.model3.json`, textures,
   and your motions; include physics/expressions if used. Register motions in the
   model descriptor using Cubism Viewer. Run the pipeline's `check-export`.
8. In Cubism Viewer or the target SDK, run standing/breathing for 30 seconds, then
   wave + breathe, tilt + breathe and accessories + breathe. Check planted feet,
   transparent edges, shoulder seams, loop boundaries, blink/talk and transitions.
   Record the tested editor/SDK versions and model hash. File preflight alone is
   not proof of visual quality, bound parameters or runtime compatibility.

Official references:
- https://docs.live2d.com/en/cubism-editor-manual/psd-import/
- https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/
