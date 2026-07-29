(function () {
  const DRAG_THRESHOLD = 4;

  document.querySelectorAll(".window--draggable").forEach((win) => {
    const titlebar = win.querySelector(".window__titlebar");
    if (!titlebar) return;

    let startClientX = 0;
    let startClientY = 0;
    let translateAtPressX = 0;
    let translateAtPressY = 0;
    let currentX = 0;
    let currentY = 0;
    let dragging = false;
    let pointerId = null;

    const parseTranslate = () => {
      const t = win.style.transform;
      const m = /translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/.exec(t);
      if (m) {
        return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
      }
      return { x: 0, y: 0 };
    };

    const apply = (x, y) => {
      win.style.transform = `translate(${x}px, ${y}px)`;
    };

    titlebar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      titlebar.setPointerCapture(pointerId);
      const prev = parseTranslate();
      currentX = prev.x;
      currentY = prev.y;
      translateAtPressX = currentX;
      translateAtPressY = currentY;
      startClientX = e.clientX;
      startClientY = e.clientY;
      win.style.position = "relative";
      win.style.zIndex = String(1000 + (Date.now() % 9000));
      dragging = false;
    });

    titlebar.addEventListener("pointermove", (e) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragging = true;
      }
      if (dragging) {
        currentX = translateAtPressX + dx;
        currentY = translateAtPressY + dy;
        apply(currentX, currentY);
      }
    });

    const end = (e) => {
      if (pointerId !== e.pointerId) return;
      try {
        titlebar.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      pointerId = null;
      dragging = false;
    };

    titlebar.addEventListener("pointerup", end);
    titlebar.addEventListener("pointercancel", end);
  });
})();
