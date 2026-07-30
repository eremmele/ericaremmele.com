/**
 * Auto-scroll for undrmnd portfolio carousel embeds.
 * Parent iframe is sized to 1310px so layout matches undrmnd.com desktop.
 * Ease smoothly between sections; pause briefly on each.
 */
(function () {
  if (!document.documentElement.classList.contains("embed-carousel")) return;

  var direction = 1;
  var pauseSectionMs = 900;
  var pauseEndsMs = 1200;
  var pauseUntil = 0;
  var sectionIndex = 0;
  var moving = false;
  var animFrom = 0;
  var animTo = 0;
  var animStart = 0;
  var animDur = 0;
  var pendingIndex = null;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function scrollRoot() {
    return document.scrollingElement || document.documentElement;
  }

  function maxScroll() {
    var root = scrollRoot();
    return Math.max(0, root.scrollHeight - root.clientHeight);
  }

  function sectionTops() {
    var nodes = document.querySelectorAll(
      "body > section, main section, .lib-main > section",
    );
    var tops = [];
    var seen = {};
    for (var i = 0; i < nodes.length; i++) {
      var top = Math.max(0, Math.min(maxScroll(), nodes[i].offsetTop));
      var key = String(Math.round(top / 8) * 8);
      if (seen[key]) continue;
      seen[key] = true;
      tops.push(top);
    }
    if (tops.length === 0 || tops[0] > 8) tops.unshift(0);
    var end = maxScroll();
    if (tops[tops.length - 1] < end - 8) tops.push(end);
    return tops;
  }

  function nextIndex(tops) {
    var next = sectionIndex + direction;
    if (next >= tops.length) {
      direction = -1;
      return { index: Math.max(0, tops.length - 2), end: true };
    }
    if (next < 0) {
      direction = 1;
      return { index: Math.min(1, tops.length - 1), end: true };
    }
    return { index: next, end: false };
  }

  function beginTravel(index, tops, now) {
    var root = scrollRoot();
    animFrom = root.scrollTop;
    animTo = tops[index];
    animStart = now;
    animDur = Math.min(1600, Math.max(700, Math.abs(animTo - animFrom) * 0.6));
    moving = true;
    pendingIndex = index;
  }

  function tick(now) {
    var root = scrollRoot();
    var max = maxScroll();

    if (max > 4 && now >= pauseUntil) {
      var tops = sectionTops();
      if (tops.length >= 2) {
        if (!moving) {
          if (pendingIndex !== null && pendingIndex !== sectionIndex) {
            beginTravel(pendingIndex, tops, now);
          } else {
            var pick = nextIndex(tops);
            if (pick.end) {
              pendingIndex = pick.index;
              pauseUntil = now + pauseEndsMs;
            } else {
              beginTravel(pick.index, tops, now);
            }
          }
        }

        if (moving) {
          var t = animDur <= 0 ? 1 : (now - animStart) / animDur;
          if (t >= 1) {
            root.scrollTop = animTo;
            sectionIndex = pendingIndex !== null ? pendingIndex : sectionIndex;
            pendingIndex = null;
            moving = false;
            pauseUntil = now + pauseSectionMs;
          } else {
            root.scrollTop =
              animFrom + (animTo - animFrom) * easeInOutCubic(Math.min(1, t));
          }
        }
      }
    }

    requestAnimationFrame(tick);
  }

  scrollRoot().scrollTop = 0;
  sectionIndex = 0;
  moving = false;
  pendingIndex = null;

  requestAnimationFrame(function () {
    requestAnimationFrame(function (now) {
      pauseUntil = now + pauseSectionMs;
      tick(now);
    });
  });
})();
