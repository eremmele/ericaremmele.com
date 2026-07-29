# undrmnd DESIGN.md

Design context for **humans and agents**. Public browse surface: [library.html](./library.html) (includes an annotated desktop/mobile spec with type labels and measures). Structured tokens: [library/tokens.json](./library/tokens.json). Live CSS: [styles.css](./styles.css).

undrmnd is a **public learning commons** — a library, not a feed. The visual language translates a physical e‑ink reader to the screen. The behavioral language counters dopamine-driven UI. Everything is meant to stay **simple and open source**.

---

## North star

1. **Lower barriers to inquiry** — anyone can ask, explore, contribute without credentials.
2. **Delight without addiction** — finite sessions, clear stops, e‑ink visuals instead of addictive feeds.
3. **From doomscrolling to contribution** — curiosity and real contributions over passive consumption.
4. **Beginner-friendly commons** — beginner questions and lived experience are assets.
5. **Open-source infrastructure** — forkable; ethical learning outside extractive models.

Hinge line: *The library should send you outside more often than it pulls you in.*

---

## What undrmnd is / is not

| Is | Is not |
|----|--------|
| Spatial public learning library | Social feed |
| Strata as knowledge objects | Posts optimized for engagement |
| Counter-algorithmic | Engagement-maximizing ranking |
| E‑ink / paperwhite atmosphere | Vibrant dopamine SaaS chrome |
| AI used sparingly (intent + related) | AI oracle / tutor that decides wonder |
| Open, forkable commons | Credentials-first gatekeeping |

---

## Surfaces

Use only these climates:

- **Paper** (`--paper` `#f1ece1`) — default editorial reading ground; soft grain.
- **Night** (`--night` `#16140f`) — hero and deep sections; warm charcoal, not OLED black.
- **Paperwhite / e‑ink** (`--eink` `#cfc7b4`) — device metaphor for slow reading; greenish LCD tint.

Do **not** introduce purple-to-indigo gradients, cream+terracotta clichés as a new system, glow effects, glassmorphism stacks, or saturated brand primaries.

---

## Color tokens (intent-named)

Prefer role names over `primary` / `secondary`.

| Token | Hex | Role |
|-------|-----|------|
| paper | `#f1ece1` | Page ground |
| paper-raised | `#e8e1d1` | Quiet lift |
| fog | `#d4cdb9` | Obscured map / atmosphere |
| hairline | `#b9b09a` | Borders |
| graphite-600 | `#3a3833` | Secondary text |
| ink / graphite-900 | `#1b1a17` | Primary text |
| accent | `#5a4a2f` | Emphasis, link, italic hinge |
| accent-soft | `#8a7551` | Soft cues on dark |
| night | `#16140f` | Dark ground |
| night-raised | `#1f1c16` | Dark panels |
| night-hairline | `#3a342a` | Dark borders |
| night-text | `#e9e2d1` | Text on night |
| night-muted | `#aea493` | Secondary on night |
| eink | `#cfc7b4` | Paperwhite ground |
| eink-deep | `#b6ad99` | Bezel / deeper frame |
| eink-ink | `#2a2820` | Ink on paperwhite |

Source of truth for the site: `:root` in `styles.css`. iOS mirrors intent in `UndrmndPrototypeTheme.swift` (app repo).

---

## Typography

- **MD Lórien** (serif) — headlines, body, contemplative voice.
- **MD UI** (sans) — labels, nav, Kindle/status chrome, metadata.
- Body ~18px / 1.6, measure ~62ch.
- Section titles often use an *italic hinge* word in accent color.
- Never default to Inter / Roboto / Arial as the brand voice.

---

## Patterns (do)

1. Finite sessions (e.g. three-card loop with explicit end).
2. Fog-of-war reveal — library opens as people read/contribute; topical adjacency, not chrono feeds.
3. Strata schema — title, summary, source, tags, relations, prompts, field notes, visibility.
4. Friction as feature — load-more gates, reflective pauses, conscious continue.
5. Field notes that return attention to the world (counter digital anhedonia).
6. AI only for semantic start + related Strata — not content oracle.
7. Time-honest estimates; real citations; no fabricated urgency.
8. One job per marketing section; lean hero budget (brand, one line, one support, one CTA group, one visual).

---

## Anti-patterns (never)

- Infinite scroll without gates
- Streaks, karma, leaderboards, “one more for free,” guilt framing, false scarcity
- Phantom notifications, fake urgency, variable reward loops
- Autoplay by default; frictionless pull-to-refresh on feeds
- Engagement algorithms without user control
- Dopamine palettes, glow, pill clusters, stat strips, hero cards/badges
- Tracking SDKs; analytics leaving device without consent
- Fabricated DOIs/URLs

Content gate (app): see `docs/CONTENT_RUBRIC.md` in the undrmnd app repo.

---

## Components (site)

Reuse existing primitives before inventing chrome:

- `.btn` / `.btn-ghost` / `.btn-on-dark`
- `.label` / `.eyebrow`
- `.paperwhite` / `.kindle` frames
- `.strata-card` for knowledge objects (not generic marketing cards)
- Sound dock — companion to reading, not entertainment chrome

Cards are allowed when they are the container for a real interaction (e.g. Strata). Do not card-wrap the hero.

---

## Motion

- Purposeful: fog reveal, scroll reveal, header hide/show.
- Respect `prefers-reduced-motion`.
- Prefer paper-clearing and soft grain over bounce, glow, and confetti.

---

## Agent operating rules

When generating UI or copy for undrmnd:

1. Ask: does this **protect** attention or **extract** it?
2. Make the **stopping point** visible.
3. Use **intent-named tokens**; do not invent a second palette.
4. Keep voice literary, calm, slightly wry — soft imperatives, not growth CTAs.
5. Prefer forking and documenting decisions over silent visual “improvements” toward generic AI-SaaS aesthetics.
6. If site library and legacy `.cursorrules` pattern names conflict, prefer **this file + product brief + library.html**.

---

## Related

- Site: [undrmnd.com](https://undrmnd.com) · [colophon](./colophon.html)
- App: [github.com/eremmele/undrmnd](https://github.com/eremmele/undrmnd)
- Product brief & rubric live in the app `docs/` folder
