Place your garden scene here as `garden.glb`.

Current file: Meshy nighttime landscape, optimized (~12MB).
- Draco mesh compression
- Textures resized to max 1024px

Rebuild/optimize again with:
```bash
npx gltf-transform optimize garden.source.glb garden.glb --texture-size 1024 --compress draco
```
