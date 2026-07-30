# Garden models

## Landscape

Place the garden scene here as `garden.glb`.

Current file: Meshy nighttime landscape, Draco-optimized.

Rebuild/optimize again with:

```bash
npx @gltf-transform/cli optimize garden.source.glb garden.glb --texture-size 1024 --compress draco
```

## Foliage (`foliage/`)

Dense woodland undergrowth scatter layer — three Meshy foliage clumps, position-welded, mesh-simplified (~14–23k tris), textures resized to 512px, Draco-compressed:

| File | Role |
|------|------|
| `dock-leaf-clump.glb` | Base leaf carpet |
| `fern-frond-clump.glb` | Mid-layer ferns |
| `bright-accent-foliage.glb` | Warm accent patches |

Scattered at runtime by `src/garden/FoliageScatter.ts` onto the landscape height field (terrain mesh unchanged). Group name: `forest-foliage`.

Optimization keeps UV seams intact (no position-bucket welding). Rebuild:

```bash
npx @gltf-transform/cli optimize source.glb out.glb --texture-size 1024 --compress draco --simplify false
# optional UV-safe simplify via meshoptimizer (floors ~30–40% of original on these Meshy clumps)
```
