/**
 * CRT post-process matching Babylon.js study:
 * https://babylonjs.medium.com/retro-crt-shader-a-post-processing-effect-study-1cb3f783afbc
 *
 * Full element rasterize (html2canvas) + curveRemapUV, dual-axis scanlines,
 * vignette, brightness. Scroll only re-draws from existing texture + scroll uniform.
 */
(function () {
  var mask = document.getElementById("crt-screen-mask");
  var canvas = document.getElementById("crt-babylon-canvas");
  var source = document.getElementById("crt-babylon-source");
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (source) source.classList.add("crt-babylon-source--fallback");
    if (canvas) canvas.style.display = "none";
    return;
  }
  if (!mask || !canvas || !source || typeof html2canvas !== "function") {
    if (source) source.classList.add("crt-babylon-source--fallback");
    return;
  }

  var gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) {
    source.classList.add("crt-babylon-source--fallback");
    canvas.style.display = "none";
    return;
  }

  /* Clip-space quad: a_pos.y = +1 top, -1 bottom. v_uv.y = 0 at top (matches html2canvas / document). */
  var vertSrc =
    "attribute vec2 a_pos;varying vec2 v_uv;void main(){" +
    "v_uv=vec2(a_pos.x*0.5+0.5,a_pos.y*-0.5+0.5);gl_Position=vec4(a_pos,0.0,1.0);}";
  var fragSrc =
    "precision highp float;uniform sampler2D u_tex;uniform vec2 u_resolution;uniform vec2 u_curvature;" +
    "uniform vec2 u_scan_opacity;uniform float u_vig_strength;uniform float u_brightness;" +
    "uniform float u_scroll_y;uniform float u_view_h;uniform float u_cap_h;uniform float u_crt_mix;" +
    "varying vec2 v_uv;" +
    "vec2 curveRemapUV(vec2 uv){vec2 a=uv*2.0-1.0;vec2 o=abs(a.yx)/u_curvature;a=a+a*o*o;return a*0.5+0.5;}" +
    "vec3 scanLine(float coord,float res,float op){float i=sin(coord*res*3.14159265*2.0);" +
    "i=(0.5*i+0.5)*0.9+0.1;return vec3(pow(i,max(op,0.02)));}" +
    "void main(){" +
    "vec2 uv=curveRemapUV(v_uv);" +
    "if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}" +
    "float ty=(u_scroll_y+uv.y*u_view_h)/u_cap_h;" +
    "float tcx=clamp(uv.x,0.002,0.998);" +
    "float tcy=clamp(1.0-ty,0.002,0.998);" +
    "vec3 rawRgb=texture2D(u_tex,vec2(tcx,tcy)).rgb;vec4 base=vec4(rawRgb,1.0);" +
    "base.rgb*=scanLine(uv.x,u_resolution.y,u_scan_opacity.x);" +
    "base.rgb*=scanLine(uv.y,u_resolution.x,u_scan_opacity.y);" +
    "float vig=16.0*uv.x*(1.0-uv.x)*uv.y*(1.0-uv.y);vig=pow(clamp(vig,0.0,1.0),u_vig_strength);" +
    "base.rgb*=mix(0.18,1.0,vig);base.rgb*=u_brightness;" +
    "base.rgb=mix(rawRgb,base.rgb,u_crt_mix);gl_FragColor=base;}";

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, vertSrc);
  var fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("CRT shader link:", gl.getProgramInfoLog(prog));
    source.classList.add("crt-babylon-source--fallback");
    canvas.style.display = "none";
    return;
  }

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  var locPos = gl.getAttribLocation(prog, "a_pos");
  var uTex = gl.getUniformLocation(prog, "u_tex");
  var uRes = gl.getUniformLocation(prog, "u_resolution");
  var uCurv = gl.getUniformLocation(prog, "u_curvature");
  var uScan = gl.getUniformLocation(prog, "u_scan_opacity");
  var uVig = gl.getUniformLocation(prog, "u_vig_strength");
  var uBright = gl.getUniformLocation(prog, "u_brightness");
  var uScroll = gl.getUniformLocation(prog, "u_scroll_y");
  var uVH = gl.getUniformLocation(prog, "u_view_h");
  var uCH = gl.getUniformLocation(prog, "u_cap_h");
  var uCrtMix = gl.getUniformLocation(prog, "u_crt_mix");

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  var capH = 1;
  var capReady = false;
  var capturing = false;
  var captureQueued = true;

  function setCanvasSize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = mask.clientWidth;
    var h = mask.clientHeight;
    if (w < 2 || h < 2) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function drawGL() {
    if (!capReady || capH < 2) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uTex, 0);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uCurv, 12.0, 12.0);
    gl.uniform2f(uScan, 0.38, 0.38);
    gl.uniform1f(uVig, 0.62);
    gl.uniform1f(uBright, 1.3);
    gl.uniform1f(uScroll, mask.scrollTop);
    gl.uniform1f(uVH, mask.clientHeight);
    gl.uniform1f(uCH, capH);
    gl.uniform1f(uCrtMix, 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function captureFull(done) {
    if (capturing) return;
    capturing = true;
    var scale = Math.min(1, (window.devicePixelRatio || 1) * 0.85);
    /* Match scrollport width so the raster isn’t wider than the glass (avoids lopsided black gutters). */
    var innerW = mask.clientWidth;
    var capW = Math.max(1, Math.round(innerW));
    var capPxH = Math.max(1, Math.round(source.scrollHeight));
    html2canvas(source, {
      backgroundColor: "#030c33",
      scale: scale,
      logging: false,
      useCORS: true,
      width: capW,
      height: capPxH,
      windowWidth: capW,
      windowHeight: capPxH,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
    })
      .then(function (c) {
        capturing = false;
        capH = c.height;
        capReady = capH > 4;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        /* Canvas / 2D element: flip on upload so GL t=1 matches image top (same as three.js ImageBitmap path). */
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        drawGL();
        if (done) done();
      })
      .catch(function () {
        capturing = false;
        source.classList.add("crt-babylon-source--fallback");
        canvas.style.display = "none";
      });
  }

  function scheduleCapture() {
    if (captureQueued) return;
    captureQueued = true;
    requestAnimationFrame(function () {
      captureQueued = false;
      if (mask.clientWidth < 2) return;
      captureFull();
    });
  }

  mask.addEventListener(
    "scroll",
    function () {
      drawGL();
    },
    { passive: true }
  );

  var resizeTimer;
  var captureDebounce;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      setCanvasSize();
      captureFull();
    }, 180);
  });

  function debouncedCapture() {
    clearTimeout(captureDebounce);
    captureDebounce = setTimeout(scheduleCapture, 160);
  }

  var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(debouncedCapture) : null;
  if (ro) ro.observe(mask);

  /* Re-rasterize periodically so CSS animations + live text (countdown) appear inside the CRT (not a single frozen frame). */
  var LIVE_RASTER_MS = 175;
  var liveTimer = null;
  function liveRasterTick() {
    if (document.visibilityState !== "visible" || mask.clientWidth < 2) {
      liveTimer = window.setTimeout(liveRasterTick, LIVE_RASTER_MS);
      return;
    }
    if (!capturing && capReady) captureFull();
    liveTimer = window.setTimeout(liveRasterTick, LIVE_RASTER_MS);
  }

  requestAnimationFrame(function init() {
    setCanvasSize();
    captureFull(function () {
      liveTimer = window.setTimeout(liveRasterTick, LIVE_RASTER_MS);
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && liveTimer) {
      window.clearTimeout(liveTimer);
      liveTimer = null;
    } else if (document.visibilityState === "visible" && capReady && !liveTimer) {
      liveTimer = window.setTimeout(liveRasterTick, LIVE_RASTER_MS);
    }
  });
})();
