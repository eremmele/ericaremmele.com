/**
 * Spawns short-lived meteor streaks (Framer SWG Wars–style), fixed layer above body BG.
 */
(function () {
  if (typeof document === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var FIELD_CLASS = "swg-meteor-field";

  function ensureField() {
    var el = document.querySelector("." + FIELD_CLASS);
    if (el) return el;
    el = document.createElement("div");
    el.className = FIELD_CLASS;
    el.setAttribute("aria-hidden", "true");
    var skip = document.querySelector(".skip-link");
    var terminal = document.querySelector(".crt-terminal");
    if (skip && skip.parentNode) {
      skip.parentNode.insertBefore(el, skip.nextSibling);
    } else if (terminal && terminal.parentNode) {
      terminal.parentNode.insertBefore(el, terminal);
    } else {
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawn(field) {
    var vw = document.documentElement.clientWidth || window.innerWidth || 1200;
    var vh = document.documentElement.clientHeight || window.innerHeight || 800;

    var fromTop = Math.random() > 0.35;
    var x;
    var y;
    if (fromTop) {
      x = rand(-vw * 0.15, vw * 0.92);
      y = rand(-vh * 0.22, -20);
    } else {
      x = rand(-180, -20);
      y = rand(-40, vh * 0.55);
    }

    var angle = rand(-28, -58);
    var len = rand(40, 120);
    var travel = rand(Math.max(vw, vh) * 0.55, Math.max(vw, vh) * 1.15);
    var dur = rand(0.55, 1.35);
    var thick = rand(1.2, 2.4);
    var peak = rand(0.65, 0.98);

    var m = document.createElement("div");
    m.className = "swg-meteor";
    m.style.left = Math.round(x) + "px";
    m.style.top = Math.round(y) + "px";
    m.style.setProperty("--swg-meteor-ang", angle.toFixed(2) + "deg");
    m.style.setProperty("--swg-meteor-len", len.toFixed(0) + "px");
    m.style.setProperty("--swg-meteor-travel", travel.toFixed(0) + "px");
    m.style.setProperty("--swg-meteor-thickness", thick.toFixed(2) + "px");
    m.style.setProperty("--swg-meteor-peak", peak.toFixed(2));
    m.style.animationDuration = dur.toFixed(2) + "s";

    field.appendChild(m);
    window.setTimeout(function () {
      if (m.parentNode) m.parentNode.removeChild(m);
    }, dur * 1000 + 120);
  }

  function schedule(field) {
    var next = rand(350, 2200);
    window.setTimeout(function tick() {
      if (!document.body.contains(field)) return;
      spawn(field);
      window.setTimeout(tick, rand(400, 2800));
    }, next);
  }

  var field = ensureField();
  for (var i = 0; i < 3; i++) spawn(field);
  schedule(field);
})();
