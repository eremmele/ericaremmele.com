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

  var gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    source.classList.add("crt-babylon-source--fallback");
    canvas.style.display = "none";
    return;
  }

  /* Clip-space quad: a_pos.y = +1 top, -1 bottom. v_uv.y = 0 at top (matches html2canvas / document). */
  var vertSrc =
    "attribute vec2 a_pos;varying vec2 v_uv;void main(){" +
    "v_uv=vec2(a_pos.x*0.5+0.5,a_pos.y*-0.5+0.5);gl_Position=vec4(a_pos,0.0,1.0);}";
  /* VCR playback on a curved tube: docked header, chroma split, scanlines, tracking, grain. */
  var fragSrc =
    "precision highp float;uniform sampler2D u_tex;uniform vec2 u_resolution;uniform vec2 u_curvature;" +
    "uniform float u_vig_strength;uniform float u_brightness;" +
    "uniform float u_scroll_y;uniform float u_view_h;uniform float u_cap_h;uniform float u_crt_mix;" +
    "uniform float u_bar_px;uniform float u_time;" +
    "varying vec2 v_uv;" +
    "vec2 curveRemapUV(vec2 uv){vec2 a=uv*2.0-1.0;vec2 o=abs(a.yx)/u_curvature;a=a+a*o*o;return a*0.5+0.5;}" +
    "void main(){" +
    "vec2 uv=curveRemapUV(v_uv);" +
    "if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}" +
    "float wobble=sin(uv.y*28.0+u_time*3.4)*0.00045;" +
    "float bar=clamp(u_bar_px,0.0,max(u_view_h-1.0,1.0));" +
    "float yPx=uv.y*u_view_h;" +
    "float ty;" +
    "if(yPx<bar){ty=yPx/u_cap_h;}" +
    "else{float span=max(u_view_h-bar,1.0);float inner=(yPx-bar)/span;ty=(bar+u_scroll_y+inner*span)/u_cap_h;}" +
    "float tcx=clamp(uv.x+wobble,0.002,0.998);" +
    "float tcy=clamp(1.0-ty,0.002,0.998);" +
    "float aberr=0.00115;" +
    "vec3 rawRgb;" +
    "rawRgb.r=texture2D(u_tex,vec2(clamp(tcx+aberr,0.002,0.998),tcy)).r;" +
    "rawRgb.g=texture2D(u_tex,vec2(tcx,tcy)).g;" +
    "rawRgb.b=texture2D(u_tex,vec2(clamp(tcx-aberr,0.002,0.998),tcy)).b;" +
    "vec4 base=vec4(rawRgb,1.0);" +
    "float scan=sin(yPx*1.5708);" +
    "base.rgb*=0.84+0.16*(0.5+0.5*scan);" +
    "float grille=sin(uv.x*u_resolution.x*1.047);" +
    "base.rgb*=0.94+0.06*(0.5+0.5*grille);" +
    "float vig=16.0*uv.x*(1.0-uv.x)*uv.y*(1.0-uv.y);vig=pow(clamp(vig,0.0,1.0),u_vig_strength);" +
    "base.rgb*=mix(0.5,1.0,vig);base.rgb*=u_brightness;" +
    "float roll=fract(u_time*0.045);" +
    "float band=exp(-pow((uv.y-roll)*30.0,2.0));" +
    "base.rgb+=band*0.035;" +
    "float grain=fract(sin(dot(gl_FragCoord.xy+vec2(u_time*24.0,u_time*17.0),vec2(12.9898,78.233)))*43758.5453);" +
    "base.rgb+=(grain-0.5)*0.028;" +
    "if(yPx>bar && yPx<bar+18.0){float shade=1.0-(yPx-bar)/18.0;base.rgb*=mix(1.0,0.72,shade);}" +
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
  var uVig = gl.getUniformLocation(prog, "u_vig_strength");
  var uBright = gl.getUniformLocation(prog, "u_brightness");
  var uScroll = gl.getUniformLocation(prog, "u_scroll_y");
  var uVH = gl.getUniformLocation(prog, "u_view_h");
  var uCH = gl.getUniformLocation(prog, "u_cap_h");
  var uCrtMix = gl.getUniformLocation(prog, "u_crt_mix");
  var uBar = gl.getUniformLocation(prog, "u_bar_px");
  var uTime = gl.getUniformLocation(prog, "u_time");

  function measureDock() {
    var bar = source.querySelector(".menubar");
    if (!bar) return 0;
    /* Sticky offsetTop includes the scroll shift, so the in-flow bar is just its own height
       (it is the first row of the raster). */
    var h = bar.offsetHeight;
    mask.style.setProperty("--crt-dock-h", h + "px");
    return h;
  }

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  var capH = 1;
  var capReady = false;
  var capturing = false;
  var captureQueued = false;
  var scrolling = false;
  var scrollIdleTimer = 0;

  function resetGLObjects() {
    var vs2 = compile(gl.VERTEX_SHADER, vertSrc);
    var fs2 = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs2 || !fs2) return;
    prog = gl.createProgram();
    gl.attachShader(prog, vs2);
    gl.attachShader(prog, fs2);
    gl.linkProgram(prog);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    locPos = gl.getAttribLocation(prog, "a_pos");
    uTex = gl.getUniformLocation(prog, "u_tex");
    uRes = gl.getUniformLocation(prog, "u_resolution");
    uCurv = gl.getUniformLocation(prog, "u_curvature");
    uVig = gl.getUniformLocation(prog, "u_vig_strength");
    uBright = gl.getUniformLocation(prog, "u_brightness");
    uScroll = gl.getUniformLocation(prog, "u_scroll_y");
    uVH = gl.getUniformLocation(prog, "u_view_h");
    uCH = gl.getUniformLocation(prog, "u_cap_h");
    uCrtMix = gl.getUniformLocation(prog, "u_crt_mix");
    uBar = gl.getUniformLocation(prog, "u_bar_px");
    uTime = gl.getUniformLocation(prog, "u_time");
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    capReady = false;
  }

  function setCanvasSize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = mask.clientWidth;
    var h = mask.clientHeight;
    if (w < 2 || h < 2) return;
    var bw = Math.floor(w * dpr);
    var bh = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    /* Assigning canvas.width resets the WebGL context even when the value is unchanged. */
    if (canvas.width === bw && canvas.height === bh) return;
    canvas.width = bw;
    canvas.height = bh;
    resetGLObjects();
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
    gl.uniform2f(uCurv, 8.5, 7.0);
    gl.uniform1f(uVig, 0.55);
    gl.uniform1f(uBright, 1.14);
    gl.uniform1f(uScroll, mask.scrollTop);
    gl.uniform1f(uVH, mask.clientHeight);
    gl.uniform1f(uCH, capH);
    gl.uniform1f(uCrtMix, 1.0);
    gl.uniform1f(uBar, measureDock());
    gl.uniform1f(uTime, performance.now() * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function captureFull(done) {
    if (capturing) return;
    capturing = true;
    var scale = Math.min(1, (window.devicePixelRatio || 1) * 0.5);
    var cssW = Math.max(1, Math.round(source.clientWidth));
    var cssH = Math.max(1, Math.round(source.scrollHeight));
    /* Render in a window the same width as the glass so the two-column grid
       stays centered. A narrower clone parks the modules on the left. */
    html2canvas(source, {
      backgroundColor: "#030c33",
      scale: scale,
      logging: false,
      useCORS: true,
      width: cssW,
      height: cssH,
      windowWidth: cssW,
      windowHeight: cssH,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: function (doc) {
        var bar = doc.querySelector(".menubar");
        if (!bar) return;
        bar.style.position = "relative";
        bar.style.top = "auto";
      },
    })
      .then(function (c) {
        capturing = false;
        capH = cssH;
        capReady = c.height > 4 && c.width > 4;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        drawGL();
        if (done) done();
      })
      .catch(function (err) {
        capturing = false;
        console.warn("CRT raster failed", err);
        if (!capReady) {
          source.classList.add("crt-babylon-source--fallback");
          canvas.style.display = "none";
        }
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
      scrolling = true;
      drawGL();
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(function () {
        scrolling = false;
      }, 180);
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

  /* Refresh the clock and countdown without recapturing while the glass is scrolling. */
  var LIVE_RASTER_MS = 1000;
  var liveTimer = null;
  function liveRasterTick() {
    if (document.visibilityState === "visible" && mask.clientWidth > 2 && !capturing && capReady && !scrolling) {
      captureFull();
    }
    liveTimer = window.setTimeout(liveRasterTick, LIVE_RASTER_MS);
  }

  function animateTube() {
    if (capReady) drawGL();
    requestAnimationFrame(animateTube);
  }

  requestAnimationFrame(function init() {
    setCanvasSize();
    captureFull(function () {
      liveTimer = window.setTimeout(liveRasterTick, LIVE_RASTER_MS);
    });
  });
  requestAnimationFrame(animateTube);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && liveTimer) {
      window.clearTimeout(liveTimer);
      liveTimer = null;
    } else if (document.visibilityState === "visible" && capReady && !liveTimer) {
      liveTimer = window.setTimeout(liveRasterTick, LIVE_RASTER_MS);
    }
  });
})();
