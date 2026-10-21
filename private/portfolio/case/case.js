/**
 * Shared case-study behavior. Each project page links this file and
 * /portfolio/case/case.css, then fills <article class="case"> with the
 * same section classes: .intro, .phone-stage, .work, .mission,
 * [data-case-gallery], and [data-next-project].
 */
const GALLERY_STEP = 0.72;

function mountGallery(gallery) {
  const pin = gallery.querySelector(".gallery-pin");
  const track = gallery.querySelector(".gallery-track");
  if (!(pin instanceof HTMLElement) || !(track instanceof HTMLElement)) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const steps = Math.max(track.children.length - 1, 0);

  const layout = () => {
    const slideH = Math.min(650, window.innerHeight - 48);
    gallery.style.setProperty("--slide-h", `${slideH}px`);
    const style = getComputedStyle(pin);
    const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const inner = Math.max(pin.clientWidth - pad, 0);
    gallery.style.setProperty("--slide-w", `${inner}px`);
    gallery.style.setProperty("--mac-scale", String(inner / 1160));
    if (reduce) {
      gallery.style.height = "";
      track.style.transform = "";
      return;
    }
    gallery.style.height = `${slideH + steps * window.innerHeight * GALLERY_STEP}px`;
  };

  const update = () => {
    if (reduce) return;
    const rect = gallery.getBoundingClientRect();
    const pinH = pin.getBoundingClientRect().height;
    const stickyTop = Math.max(24, (window.innerHeight - pinH) / 2);
    const travel = Math.max(gallery.offsetHeight - pinH, 1);
    const passed = Math.min(Math.max(stickyTop - rect.top, 0), travel);
    const style = getComputedStyle(pin);
    const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const visible = pin.clientWidth - pad;
    const maxX = Math.max(track.scrollWidth - visible, 0);
    track.style.transform = `translate3d(${-(passed / travel) * maxX}px, 0, 0)`;
  };

  layout();
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", () => {
    layout();
    update();
  });
}

function mountNext(button) {
  button.addEventListener("click", () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "portfolio-next" }, "*");
      return;
    }
    const href = button.getAttribute("data-next-href");
    if (href) window.location.href = href;
  });
}

function mountCase() {
  document.querySelectorAll("[data-case-gallery]").forEach((gallery) => {
    if (gallery instanceof HTMLElement) mountGallery(gallery);
  });
  document.querySelectorAll("[data-next-project]").forEach((button) => {
    if (button instanceof HTMLButtonElement) mountNext(button);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || window.parent === window) return;
    window.parent.postMessage({ type: "portfolio-close" }, "*");
  });
}

mountCase();
