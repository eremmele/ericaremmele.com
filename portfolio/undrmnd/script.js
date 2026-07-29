/* undrmnd site interactions */


(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isEmbed = document.documentElement.classList.contains("embed-carousel");


  /* ---------- Header scroll + dark-context detection ---------- */
  const header = document.getElementById("site-header");
  const darkSections = document.querySelectorAll("section.dark, section.hero");


  let lastScrollY = window.scrollY;
  let scrollAccum = 0;
  const HIDE_THRESHOLD = 24;   // px of continuous downward scroll before hiding
  const SHOW_THRESHOLD = 8;    // px of upward scroll before showing


  const updateHeaderBg = () => {
    const y = window.scrollY;
    if (y > 12) header.classList.add("scrolled");
    else header.classList.remove("scrolled");


    // Does header overlap a dark section
    const headerBottom = header.getBoundingClientRect().bottom + 1;
    let onDark = false;
    darkSections.forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.top <= headerBottom && r.bottom >= headerBottom) onDark = true;
    });
    header.classList.toggle("on-dark", onDark);
    document.body.classList.toggle("is-dark-context", onDark);


    // Direction-based show/hide nav + always show near top of page
    const delta = y - lastScrollY;
    if (y < 80) {
      header.classList.remove("is-hidden");
      scrollAccum = 0;
    } else if (delta > 0) {
      // scrolling down
      scrollAccum = Math.max(0, scrollAccum) + delta;
      if (scrollAccum > HIDE_THRESHOLD) header.classList.add("is-hidden");
    } else if (delta < 0) {
      // scrolling up
      scrollAccum = Math.min(0, scrollAccum) + delta;
      if (scrollAccum < -SHOW_THRESHOLD) header.classList.remove("is-hidden");
    }
    lastScrollY = y;
  };
  window.addEventListener("scroll", updateHeaderBg, { passive: true });
  window.addEventListener("resize", updateHeaderBg);
  updateHeaderBg();


  /* ---------- Reveal on scrolllllll ---------- */
  const revealEls = document.querySelectorAll(".reveal, .reveal-mask");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  revealEls.forEach((el) => io.observe(el));


  // Stagger hero mask reveals on load (deleted i think)
  window.addEventListener("load", () => {
    document.querySelectorAll(".hero .reveal-mask").forEach((el, i) => {
      setTimeout(() => el.classList.add("in"), 120 + i * 130);
    });
    document.querySelectorAll(".hero .reveal").forEach((el, i) => {
      setTimeout(() => el.classList.add("in"), 600 + i * 140);
    });
  });


  /* ---------- Hero ambient dot field for FoW ---------- */
  const heroCanvas = document.getElementById("hero-fog");
  if (heroCanvas && !prefersReduced) {
    const ctx = heroCanvas.getContext("2d");
    let w, h, dpr;
    let dots = [];


    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = heroCanvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      heroCanvas.width = w * dpr;
      heroCanvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.floor((w * h) / 4200);
      dots = [];
      for (let i = 0; i < target; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.0 + 0.3,
          vx: (Math.random() - 0.5) * 0.06,
          vy: (Math.random() - 0.5) * 0.04 - 0.01,
          a: Math.random() * 0.45 + 0.15,
        });
      }
    };
    resize();
    window.addEventListener("resize", resize);


    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#e9e2d1";
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < -10) d.x = w + 10;
        if (d.x > w + 10) d.x = -10;
        if (d.y < -10) d.y = h + 10;
        if (d.y > h + 10) d.y = -10;
        ctx.globalAlpha = d.a;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    draw();
  }


  /* ---------- How it works / FoW map ---------- */
  const mapCanvas = document.getElementById("map");
  const mapWrap = document.getElementById("map-wrap");
  if (mapCanvas && mapWrap) {
    const ctx = mapCanvas.getContext("2d");
    let w, h, dpr, nodes = [];
    let mouse = { x: -9999, y: -9999, active: false };
    let scrollProgress = 0;


    const STRATA_LABELS = [
      "Lichen recolonisation", "Tide pools", "Folk indicators of air quality",
      "Sourdough microbiomes", "Subway ecologies", "Estuarine birdsong",
      "Glacial striations", "Dyer's woad", "Clay weathering",
      "Foxing in old paper", "Heat-island moss", "Salt marsh decline",
      "Bone china clay", "Wind-fallen apples", "Roman road alignment",
      "Dialect of fog", "Slow-moving rivers", "Verge wildflowers",
      "Quiet aircraft routes", "Mended walls", "Frost cracks",
      "Backyard astronomy", "Rooftop lichens", "Field hedgerows",
    ];


    const seedRandom = (seed) => {
      let s = seed;
      return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    };
    const rand = seedRandom(7);


    const buildNodes = () => {
      nodes = [];
      const clusters = [
        { cx: w * 0.32, cy: h * 0.46, r: w * 0.18, count: 8 },
        { cx: w * 0.65, cy: h * 0.36, r: w * 0.14, count: 6 },
        { cx: w * 0.55, cy: h * 0.72, r: w * 0.16, count: 7 },
      ];
      let idx = 0;
      clusters.forEach((c) => {
        for (let i = 0; i < c.count; i++) {
          const ang = rand() * Math.PI * 2;
          const dist = Math.sqrt(rand()) * c.r;
          nodes.push({
            x: c.cx + Math.cos(ang) * dist,
            y: c.cy + Math.sin(ang) * dist,
            r: 2 + rand() * 3,
            label: STRATA_LABELS[idx % STRATA_LABELS.length],
            cluster: clusters.indexOf(c),
          });
          idx++;
        }
      });
      for (let i = 0; i < 14; i++) {
        nodes.push({
          x: rand() * w, y: rand() * h,
          r: 1.2 + rand() * 1.2,
          label: STRATA_LABELS[idx % STRATA_LABELS.length],
          cluster: -1, ghost: true,
        });
        idx++;
      }
    };


    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = mapCanvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      mapCanvas.width = w * dpr;
      mapCanvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildNodes();
    };
    resize();
    window.addEventListener("resize", resize);


    mapCanvas.addEventListener("mousemove", (e) => {
      const rect = mapCanvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    });
    mapCanvas.addEventListener("mouseleave", () => { mouse.active = false; });
    mapCanvas.addEventListener("touchmove", (e) => {
      const rect = mapCanvas.getBoundingClientRect();
      const t = e.touches[0];
      mouse.x = t.clientX - rect.left;
      mouse.y = t.clientY - rect.top;
      mouse.active = true;
    }, { passive: true });


    const onScroll2 = () => {
      const rect = mapWrap.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      let p = 1 - (center / vh);
      p = Math.max(0, Math.min(1, p));
      scrollProgress = p;
    };
    window.addEventListener("scroll", onScroll2, { passive: true });
    onScroll2();


    let driftT = 0;
    const REVEAL_RADIUS = 170;


    const draw = () => {
      ctx.clearRect(0, 0, w, h);


      ctx.save();
      ctx.strokeStyle = "rgba(233, 226, 209, 0.06)";
      ctx.lineWidth = 1;
      const gridStep = 32;
      for (let x = 0; x < w; x += gridStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += gridStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.restore();


      driftT += 0.0035;
      const driftX = w * (0.5 + Math.cos(driftT) * 0.22);
      const driftY = h * (0.5 + Math.sin(driftT * 0.7) * 0.18);
      const cx = mouse.active ? mouse.x : driftX;
      const cy = mouse.active ? mouse.y : driftY;
      const baseRadius = REVEAL_RADIUS + scrollProgress * 120;


      ctx.save();
      ctx.strokeStyle = "rgba(233, 226, 209, 0.20)";
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          if (a.cluster === -1 || b.cluster === -1 || a.cluster !== b.cluster) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 110) {
            const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
            const dist = Math.hypot(midx - cx, midy - cy);
            const alpha = Math.max(0, 1 - dist / (baseRadius * 1.2)) * 0.5;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();


      ctx.font = '11px "MD UI", system-ui, sans-serif';
      ctx.textBaseline = "middle";
      for (const n of nodes) {
        const dist = Math.hypot(n.x - cx, n.y - cy);
        const t = Math.max(0, 1 - dist / baseRadius);
        const baseAlpha = n.ghost ? 0.18 : 0.34;
        const alpha = baseAlpha + t * (1 - baseAlpha);


        if (t > 0.5 && !n.ghost) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(196, 178, 138, ${(t - 0.5) * 0.85})`;
          ctx.lineWidth = 0.8;
          ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }


        ctx.beginPath();
        ctx.fillStyle = `rgba(233, 226, 209, ${alpha})`;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();


        if (t > 0.55 && !n.ghost) {
          const labelAlpha = (t - 0.55) / 0.45;
          ctx.fillStyle = `rgba(233, 226, 209, ${labelAlpha})`;
          ctx.fillText(n.label, n.x + n.r + 8, n.y);
        }
      }


      const grad = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * 1.4);
      grad.addColorStop(0, "rgba(22, 20, 15, 0)");
      grad.addColorStop(0.6, "rgba(22, 20, 15, 0.55)");
      grad.addColorStop(1, "rgba(22, 20, 15, 0.92)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);


      requestAnimationFrame(draw);
    };
    draw();
  }


  /* ---------- Strata stacked cards ---------- */
  const stack = document.getElementById("strata-stack");
  if (stack) {
    const tabs = stack.querySelectorAll(".strata-tab");
    const cards = stack.querySelectorAll(".strata-card");
    let active = 0;


    const set = (i) => {
      if (i === active) return;
      tabs.forEach((t, k) => t.setAttribute("aria-pressed", k === i ? "true" : "false"));
      cards.forEach((c, k) => {
        c.classList.toggle("is-active", k === i);
        c.classList.toggle("is-prev", k < i && k !== i);
      });
      active = i;
      stack.dataset.active = String(i);
    };


    tabs.forEach((t, i) => {
      t.addEventListener("click", () => set(i));
      t.addEventListener("mouseenter", () => set(i));
    });
  }


  /* ---------- Ambient sound toggle (sourced from Perplexity/Eleven Labs, licensed) ---------- */
  if (!isEmbed) {
  const dock = document.getElementById("sound-dock");
  const muteBtn = document.getElementById("sd-mute");
  const trackBtn = document.getElementById("sd-track");
  const trackLabel = document.getElementById("sd-track-label");
  const horizons = document.getElementById("audio-horizons");


  let audioCtx = null, brownGain = null, brownNode = null;
  let currentTrack = "horizons"; // 'brown' | 'horizons'
  let muted = false;
  let started = false;


  const TRACK_LABELS = { brown: "Brown", horizons: "Horizons" };


  const ensureBrown = () => {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      out[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = out[i];
      out[i] *= 3.0;
    }
    brownNode = audioCtx.createBufferSource();
    brownNode.buffer = noiseBuffer;
    brownNode.loop = true;


    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 600; lp.Q.value = 0.5;


    brownGain = audioCtx.createGain();
    brownGain.gain.value = 0;


    brownNode.connect(lp).connect(brownGain).connect(audioCtx.destination);
    brownNode.start();
  };


  const fadeBrown = (target, ms = 600) => {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    brownGain.gain.cancelScheduledValues(t);
    brownGain.gain.setValueAtTime(brownGain.gain.value, t);
    brownGain.gain.linearRampToValueAtTime(target, t + ms / 1000);
  };


  const fadeHorizons = (targetVol, ms = 800) => {
    if (!horizons) return;
    const startVol = horizons.volume;
    const startT = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - startT) / ms);
      const v = startVol + (targetVol - startVol) * p;
      horizons.volume = Math.max(0, Math.min(1, v));
      if (p < 1) requestAnimationFrame(step);
      else if (targetVol === 0) horizons.pause();
    };
    if (targetVol > 0 && horizons.paused) {
      horizons.volume = 0;
      const playP = horizons.play();
      if (playP && typeof playP.then === "function") playP.catch(() => {});
    }
    requestAnimationFrame(step);
  };


  const apply = () => {
    const wantBrown = !muted && currentTrack === "brown";
    const wantHor   = !muted && currentTrack === "horizons";
    fadeBrown(wantBrown ? 0.18 : 0);
    fadeHorizons(wantHor ? 0.55 : 0);
    muteBtn?.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn?.setAttribute("aria-label", muted ? "Un-mute ambient" : "Mute ambient");
    if (trackLabel) trackLabel.textContent = TRACK_LABELS[currentTrack];
    dock?.setAttribute("data-state", muted ? "muted" : "playing");
  };


  const startAudio = async () => {
    if (started) return;
    started = true;
    ensureBrown();
    if (audioCtx && audioCtx.state === "suspended") {
      try { await audioCtx.resume(); } catch {}
    }
    apply();
  };


  // Auto-start on first user gesture (for browser autoplay policies).
  // Only "activating" gestures count in modern browsers — scroll and wheel do NOT
  // count, so they're omitted here.
  const gestureEvents = ["pointerdown", "click", "keydown", "touchstart"];
  const onFirstGesture = () => {
    startAudio();
    gestureEvents.forEach((ev) => window.removeEventListener(ev, onFirstGesture, true));
  };
  gestureEvents.forEach((ev) => window.addEventListener(ev, onFirstGesture, { capture: true, once: true }));


  muteBtn?.addEventListener("click", async () => {
    await startAudio();
    muted = !muted;
    apply();
  });


  trackBtn?.addEventListener("click", async () => {
    await startAudio();
    currentTrack = currentTrack === "brown" ? "horizons" : "brown";
    apply();
  });


  /* ---------- Smooth scrolling b/w anchors ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id === "#" || id.length < 2) return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      const top = el.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top, behavior: prefersReduced ? "auto" : "smooth" });
    });
  });  }

})();
