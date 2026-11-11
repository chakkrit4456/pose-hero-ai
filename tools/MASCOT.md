# Refining the mascot

The homepage enables `cleanFace` in `MRTeacher3D.create`. It replaces the damaged
head and bandana shell with smooth skinned geometry and draws consistent facial
features in rest space. Every head vertex follows the original head bone with
weight 1, so dancing cannot stretch the face. Exercise previews keep their
existing presentation.

`refine_teacher.py` repairs normals across UV seams and applies bounded Taubin
smoothing to the source GLB. It preserves triangle topology, UVs, textures and
skin weights. With Python, NumPy and SciPy installed:

```sh
python tools/refine_teacher.py original-teacher.glb refined-teacher.glb
```

Use an unmodified source: repeated passes would accumulate changes. The tracked
`Web Testing System/models/teacher.glb` has already been refined. Run the game
build after replacing it to regenerate the embedded model.

Validation: `python tests/mascot-surface.py` renders the head from three camera
angles and checks normals, rigid skinning and renderer errors. Run
`python tests/lobby-dance.py` to verify desktop/mobile dance and motion controls.
