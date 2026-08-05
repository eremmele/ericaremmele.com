# Site copy — Erica Remmele portfolio

---

## Meta

**Page title** (`index.html`)
```
Erica Remmele — Senior Product Designer & Creative Director | Remote US
```

**Meta description** (`index.html`)
```
Senior product designer, UX/UI designer, and creative director available for contract, freelance, or full-time remote work. US-based (Dallas & NYC). Tech, AI, fashion, healthcare, retail & more.
```

---

## Hero

**Name / brand** (`index.html` → `.hero-name`)
```
Erica Remmele
```

**Bio** (`index.html` → `.hero-bio`)
```
Erica Remmele is a founding product designer and creative director working across UX, design systems, and brand for tech, cybersecurity, and creative teams.
```

**Nav label — Graphic Design** (`index.html`)
```
/ Graphic Design
```

**Nav label — Product Design** (`index.html`)
```
/ Product Design
```

**Nav link — LinkedIn** (`index.html`)
```
/ LinkedIn
```
Link: `https://www.linkedin.com/in/ericaremmele`

**Client list lead-in** (`index.html` → `.hero-clients`)
```
She’s partnered with teams like
```

**Client names** (`index.html` → `.hero-clients-names`)
```
Wieden+Kennedy, Nike, Abercrombie & Fitch, Universal Music, fashion startups, tech startups, and enterprise platforms.
```

**Hire CTA** (`index.html` → `.hero-hire`)
```
—Inquire!
```
Link: `mailto:erica@seeyoufriday.com`

---

## Controls & status

**Load status** (`src/main.ts`)
```
Loading garden…
```

**Load error** (`src/main.ts`)
```
Could not load garden
```

**Load progress (model)** (`src/garden/GlbGarden.ts`)
```
Loading model…
Preparing ground…
Building pixels…
```

**Carousel hint** (`index.html` → `#portfolio-drag-hint`)
```
scroll or drag
```

**Controls toggle labels** (`src/main.ts`)
```
Hide controls (H)
Show controls (H)
```

**Move controls** (`index.html` aria-labels)
```
Move forward
Turn left
Move backward
Turn right
Toggle controls (H)
```

---

## Projects

Source: `src/data/portfolio.ts`

### Cyber Product
- **id:** `cyber-product`
- **title:** `Cybersecurity`
- **year:** `2021-2026`
- **category:** `Product Design, Research, Product Management`
- **description:**
```
Leading product UX/UI and editorial systems across SWG, DLP, CASB, SSPM, LLMs + AI, and analytics, from feature definition and narrative framing through shipped interfaces and design systems.

``` 
- **link:** `#`
- **garden label:** `Product Design`

### Bridgeway
- **id:** `bridgeway`
- **title:** `Bridgeway Dental`
- **year:** `2025-2026`
- **category:** `Product Design`
- **description:**
```
Website design for a dental practice: home, full-page flows, design systems, and brand.
```
- **link:** `#`
- **garden label:** `Web Design & Dev`

### SWG Wars
- **id:** `swgwars`
- **title:** `Digital Experience`
- **year:** `2025`
- **category:** `Campaign`
- **description:**
```
Interactive campaign for a cyber startup: microsite, including screenplay-driven motion, opponent narratives, campaign graphics, and a CRT design library documenting tokens and components. Partnership with VO talent, musical talent, and lead in-house dev team.
```
- **link:** `/portfolio/swgwars/design-system/index.html`
- **garden label:** `SWG Wars`
- **embed slide title:** `Digital Experience`

### undrmnd
- **id:** `undrmnd`
- **title:** `undrmnd`
- **year:** `2026`
- **category:** `Product Design & Development`
- **description:**
```
Marketing site and design library for undrmnd: an open-source, counter-algorithmic learning commons. Live at undrmnd.com. App in beta.
```
- **link:** `https://www.undrmnd.com`
- **garden label:** `Design Engineering`
- **embed slide titles:**
  - `undrmnd.com`
  - `undrmnd Design Library`

### Cyber Brand
- **id:** `cyber-brand`
- **title:** `Cyber Startup`
- **year:** `2021-2026`
- **category:** `Creative Direction, Brand Design, Website Design & Development`
- **description:**
```
Design and creative direction for a cybersecurity brand marketing site, ongoing iterations through the years.
```
- **link:** `#`
- **garden label:** `Creative Direction`

### Cyber Print *(hidden)*
- **id:** `cyber-print`
- **title:** `Print & Typography`
- **year:** `2021-2026`
- **category:** `Brand Design, Print Design, Typography`
- **description:**
```
Print systems, typography, and graphic applications for a cybersecurity brand.
```
- **link:** `#`
- **garden label:** `Print & Type`
- **status:** Hidden from garden / hotkeys for now; assets remain in `public/portfolio/cyber-print/`.

---

## Notes

- Embedded project sites (undrmnd, SWG Wars design library) keep their own copy inside `public/portfolio/…` and are not listed here.
- Project card year + title also appear on the 3D garden thumbnails.
