# MOC3 writer attribution

`moc3writer.mjs` is derived from MangoLion/stretchystudio,
`src/io/live2d/moc3writer.js`, commit
`24a83a27ba43e43e9d2e3de5e33994594e6199c2` (MIT).
License: LICENSE-stretchystudio.txt. This is an offline authoring dependency,
not a replacement for the shared Haqi renderer.

Source: https://github.com/MangoLion/stretchystudio
Compatibility claims must be verified with the generated model in a runtime.

Local change (2026-11-03): resolve parent warp indices instead of forcing all
deformers to root. Reject forward/self parent references. The adapter supplies
child grids in parent lattice coordinates. Native Core verification covers neutral
registration and combined parameter extremes; this is not a Cubism certification.
