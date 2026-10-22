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

## Deploy on Lightsail

Use one Lightsail instance and one Node process. PM2 must stay in fork mode with `instances: 1`. Sessions live in that process, so do not add instances or switch PM2 to cluster mode.

1. Attach a static IP. In the instance firewall, open ports 80 and 443.
2. Install Node.js 20 or newer and PM2 (`npm install -g pm2`).
3. Copy this repo to the instance, including `private/portfolio`. That directory is gitignored, and both the build and the server read it.
4. On the instance, create a root-only env file (for example `/home/ubuntu/portfolio.env`, mode `600`):

   ```
   GATE_PASSWORD=the-password
   GATE_SECURE=1
   PORT=8787
   ```

   `GATE_PASSWORD` is the only seal secret. The build does not read `.gate-secret`.

5. Build on the instance:

   ```bash
   cd /path/to/portfolio-garden
   npm ci
   set -a && source /home/ubuntu/portfolio.env && set +a
   npm run build
   ```

   `npm run build` typechecks, runs the Vite build, then seals `private/portfolio` into `dist/sealed`. The command exits with an error if `GATE_PASSWORD` is unset or `private/portfolio` is missing. After login, the server serves thumbnails and project pages from `private/portfolio` when those files are on the instance, and from `dist/sealed` otherwise.

6. Start the single process:

   ```bash
   pm2 start ecosystem.config.cjs --update-env
   pm2 save
   pm2 startup
   ```

   `ecosystem.config.cjs` pins fork mode and one instance. Restart with `pm2 restart portfolio-garden --update-env` after changing the env file.

7. On the same VM, terminate TLS with Caddy or nginx and proxy to `127.0.0.1:8787`. Forward `X-Forwarded-Proto: https`.

Leave `private/portfolio` on the instance after the build. The server reads it at runtime. `npm run start:prod` builds and runs in the foreground; on Lightsail, use the PM2 commands above instead.
