# portfolio-garden

Interactive holographic portfolio — walk through a pixellated garden and inspect UX/UI work at marked points.

## Phase 1

- Procedural hologram garden fallback
- First-person navigation: **W/S** or **↑/↓** move, **A/D** or **←/→** turn, touch pad on mobile
- Three inspection points with portfolio panel overlay

## Phase 2 (current)

- Loads `public/models/garden.glb` (Meshy nighttime landscape) as a dense particle cloud
- Ground-following walk on hills; inspection markers placed from model bounds
- Falls back to procedural garden if the GLB is missing

## Phase 3

- Hand / camera interaction via MediaPipe (optional enhancement)

## Develop

```bash
npm install
npm run dev
```

Wait for **Loading garden…** (the GLB is ~83MB), then click **Enter garden**. Walk to a glowing marker, press **E** (or tap on mobile) to inspect.

## Customize portfolio

Edit `src/data/portfolio.ts`:

- Replace placeholder titles, descriptions, links
- Point `image` to files in `public/portfolio/`
- Adjust inspection point positions if you want fixed coordinates instead of auto-placed ones

## Model size note

`garden.glb` is ~12MB (Draco + 1k textures). Original Meshy export was ~94MB.

## Deploy

```bash
npm run build
```

Host `dist/` anywhere (Vercel, Netlify, GitHub Pages, Cloudflare). Point your domain's DNS away from Cargo Collective when you're ready to go live.
