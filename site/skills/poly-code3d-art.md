# Company Skill: `poly-code3d-art`

Category: `general_files` · Domain: ParaPoly / Code3D Parametric Art & Parts

## Purpose

Produce editable, parametric 3D / CAD scripts (for ParaPoly Code3D or compatible procedural CAD workflows) where geometry, colors, and sub-parts remain independently modifiable by subsequent humans or Agents.

## Mandatory Deliverable Contract

1. **Editable Code Only**: Never deliver opaque baked meshes or external URLs. Output clean, readable UTF-8 code.
2. **Independent Part Functions**: Separate major sub-assemblies into distinct callable functions (e.g., `buildHead(params)`, `buildBody(params)` or `buildTrunk(params)`, `buildCrown(params)`).
3. **Parameter Location Map**: List each key dimension, proportion, and color parameter alongside the exact function/variable name that controls it.
4. **Printability & Geometry Checklist**: Explicitly document minimum wall thickness, overhang warnings, and part attachment clearance. State clearly that this is a static code review checklist, not a slicer guarantee.
