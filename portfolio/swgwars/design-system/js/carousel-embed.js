/**
 * Auto-scroll the CRT scrollport for portfolio carousel embeds (no user scroll).
 */
(function () {
  if (document.documentElement.classList.contains("embed-carousel") === false) return;

  var mask = document.getElementById("crt-screen-mask");
  if (!mask) return;

  var direction = 1;
  var speed = 36;
  var pauseEndsMs = 900;
  var pauseUntil = 0;
  var last = performance.now();

  function syncViewportHeight() {
    var h = mask.clientHeight;
    if (h < 2) return;
    mask.style.setProperty("--crt-viewport-h", h + "px");
    var canvas = document.getElementById("crt-babylon-canvas");
    if (canvas) {
      canvas.style.height = h + "px";
      canvas.style.maxHeight = h + "px";
    }
  }

  function maxScroll() {
    return Math.max(0, mask.scrollHeight - mask.clientHeight);
  }

  function tick(now) {
    syncViewportHeight();

    var max = maxScroll();
    if (max > 4 && now >= pauseUntil) {
      var dt = Math.min(0.05, (now - last) / 1000);
      mask.scrollTop += direction * speed * dt;

      if (mask.scrollTop >= max - 1) {
        mask.scrollTop = max;
        direction = -1;
        pauseUntil = now + pauseEndsMs;
      } else if (mask.scrollTop <= 0) {
        mask.scrollTop = 0;
        direction = 1;
        pauseUntil = now + pauseEndsMs;
      }
    }

    last = now;
    requestAnimationFrame(tick);
  }

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(syncViewportHeight).observe(mask);
  }
  window.addEventListener("resize", syncViewportHeight);

  requestAnimationFrame(function () {
    syncViewportHeight();
    requestAnimationFrame(tick);
  });
})();
