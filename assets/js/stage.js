// The opening. A wall of real frames from all five places; a sweep that lights up the
// labelled people in them; a dive into one frame, which hovers like a drone over its own
// depth; then its ground truth unfolds over the whole frame, layer by layer, and the camera
// closes in on one partly hidden person until their pixels show. Then out, and on to the
// next place. Every pixel drawn comes from the frames' own files; nothing is painted by hand.

const FRAMES = [
  { place: "Dubrovnik", slug: "dubrovnik-004170" },
  { place: "Cairo", slug: "cairo-006907" },
  { place: "Bologna", slug: "bologna-010404" },
  { place: "Quarry", slug: "quarry-007165" },
  { place: "Farm", slug: "farm-011318" },
];
// Layer 0 is the plain frame; 1–5 match the buttons and the keys 1–5.
const LAYERS = [
  { name: "The frame", legend: "the delivered frame, as a detector sees it" },
  { name: "Hidden part", legend: '<span class="sw sw--vis"></span>seen by the camera <span class="sw sw--env"></span>hidden by the scene <span class="sw sw--ppl"></span>hidden by another person' },
  { name: "Each person", legend: "one colour per person, from the identity pass" },
  { name: "Boxes", legend: '<span class="sw sw--vis"></span>box around what is visible <span class="sw sw--env"></span>box around the whole body' },
  { name: "Skeleton", legend: '<span class="sw sw--vis"></span>joint on the person&rsquo;s own pixels <span class="sw sw--env"></span>joint behind something' },
  { name: "Distance", legend: "distance from the camera: near is light, far is dark, a contour every 2 m" },
];
// What a place shows when nobody steers: [seconds after arrival, layer, close in?]
const REEL = [[1.3, 1], [5.0, 4], [8.4, 5], [11.6, 1, true]];
const DWELL = 17.2;                     // seconds before moving to the next place
const PX = 1.06, PY = 0.81;             // wall pitch, in tile widths; a tile is 1 × 0.75
const IW = 1280, IH = 960;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas, uBoxes, uRGB, uData, uOver;
uniform vec2 uRes;
uniform vec4 uCam;         // centre x, y (wall units), wall units per device px, unused
uniform vec2 uTile0;       // active frame's tile, top-left, wall units
uniform float uGrid;
uniform float uWallIn, uWave, uFrameMix, uFocus;
uniform int uLayerA, uLayerB;
uniform float uWipe, uLayerMix, uHover, uPixel;
uniform vec2 uPar;
uniform vec2 uDepthRange;
uniform float uSeed;
out vec4 outColor;

const vec2 IMG = vec2(1280.0, 960.0);
const vec3 SEEN = vec3(0.776, 0.949, 0.306);
const vec3 HID  = vec3(1.000, 0.420, 0.208);
const vec3 HIDP = vec3(0.714, 0.612, 1.000);
const vec3 PAPER = vec3(0.925, 0.918, 0.886);
const vec3 INK = vec3(0.039, 0.043, 0.039);
const vec3 PAL[10] = vec3[10](
  vec3(0.776,0.949,0.306), vec3(1.000,0.420,0.208), vec3(0.714,0.612,1.000), vec3(0.380,0.820,0.800),
  vec3(0.980,0.780,0.330), vec3(0.960,0.470,0.640), vec3(0.560,0.700,1.000), vec3(0.870,0.870,0.800),
  vec3(0.470,0.880,0.520), vec3(1.000,0.620,0.470));

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
ivec2 pix(vec2 q) { return clamp(ivec2(floor(q)), ivec2(0), ivec2(IMG) - 1); }
vec4 dat(vec2 q) { return texelFetch(uData, pix(q), 0); }
int flags(vec2 q) { return int(dat(q).r * 255.0 + 0.5); }
float pid(vec2 q) { return floor(dat(q).g * 255.0 + 0.5); }
float depthV(vec2 q) {                       // bilinear inverse depth, 0 far .. 1 near
  vec2 f = q - 0.5; vec2 i = floor(f); vec2 t = f - i;
  float a = texelFetch(uData, pix(i + 0.5), 0).b, b = texelFetch(uData, pix(i + vec2(1.5, 0.5)), 0).b;
  float c = texelFetch(uData, pix(i + vec2(0.5, 1.5)), 0).b, d = texelFetch(uData, pix(i + 1.5), 0).b;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
vec2 hover(vec2 q) { return q - uPar * (depthV(q) - 0.5) * 2.0; }
float metres(float v) {
  float inear = 1.0 / uDepthRange.x, ifar = 1.0 / uDepthRange.y;
  return 1.0 / (v * (inear - ifar) + ifar);
}
float bit(vec2 q, int b) { return float((flags(q) & b) != 0); }

// a thin line on the pixel borders where a region ends; w in fractions of a pixel
float border(vec2 q, int b, float w) {
  if (bit(q, b) < 0.5) return 0.0;
  vec2 f = fract(q); float e = 0.0;
  e = max(e, (1.0 - bit(q + vec2(-1., 0.), b)) * step(f.x, w));
  e = max(e, (1.0 - bit(q + vec2( 1., 0.), b)) * step(1. - w, f.x));
  e = max(e, (1.0 - bit(q + vec2(0., -1.), b)) * step(f.y, w));
  e = max(e, (1.0 - bit(q + vec2(0.,  1.), b)) * step(1. - w, f.y));
  return e;
}
float idBorder(vec2 q, float id, float w) {
  vec2 f = fract(q); float e = 0.0;
  e = max(e, step(0.5, abs(pid(q + vec2(-1., 0.)) - id)) * step(f.x, w));
  e = max(e, step(0.5, abs(pid(q + vec2( 1., 0.)) - id)) * step(1. - w, f.x));
  e = max(e, step(0.5, abs(pid(q + vec2(0., -1.)) - id)) * step(f.y, w));
  e = max(e, step(0.5, abs(pid(q + vec2(0.,  1.)) - id)) * step(1. - w, f.y));
  return e;
}

vec3 wall(vec2 w) {
  vec2 cell = floor(w / vec2(${PX}, ${PY}));
  vec2 local = w - cell * vec2(${PX}, ${PY});
  if (local.x > 1.0 || local.y > 0.75) return INK * 0.6;
  vec2 tile = mod(cell, uGrid);
  vec2 auv = (tile + vec2(local.x, local.y / 0.75)) / uGrid;
  // explicit gradients: the tile seams would otherwise pick a blurred mip level
  vec2 gx = vec2(uCam.z / uGrid, 0.0), gy = vec2(0.0, uCam.z / (0.75 * uGrid));
  vec3 c = textureGrad(uAtlas, auv, gx, gy).rgb;
  float b = textureGrad(uBoxes, auv, gx, gy).r;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 muted = mix(vec3(lum), c, 0.6) * 0.78;
  float band = exp(-pow((dot(w, vec2(0.83, 0.56)) - uWave) / 1.6, 2.0));
  vec3 col = mix(muted, c * 1.1, band * 0.8);
  col = mix(col, SEEN, b * (0.18 + 0.82 * band));
  float delay = hash(cell + 7.0) * 0.55;
  col *= smoothstep(delay, delay + 0.45, uWallIn);
  return col;
}

// One ground-truth layer over the frame, at frame pixel q.
vec3 annotate(int L, vec2 q, vec3 base, float w) {
  if (L == 0) return base;
  int f = flags(q);
  vec2 fq = floor(q);
  if (L == 1) {
    vec3 c = base * 0.5;
    float hA = step(0.5, fract((fq.x + fq.y) * 0.25));
    float hB = step(0.5, fract((fq.x - fq.y) * 0.25));
    if ((f & 1) != 0) c = mix(base, SEEN, 0.38);
    if ((f & 2) != 0) c = mix(c, HID, 0.6 + 0.35 * hA);
    if ((f & 4) != 0) c = mix(c, HIDP, 0.6 + 0.35 * hB);
    float vis = float((f & 1) != 0);
    c = mix(c, SEEN, border(q, 1, w));
    c = mix(c, HID, border(q, 2, w) * (1.0 - vis));
    c = mix(c, HIDP, border(q, 4, w) * (1.0 - vis));
    return c;
  }
  if (L == 2) {
    float id = pid(q);
    vec3 c = base * 0.45;
    if (id > 0.5) {
      vec3 pc = PAL[int(mod(id * 7.0, 10.0))];
      float h = step(0.5, fract((fq.x + fq.y) * 0.25));
      c = (f & 1) != 0 ? mix(base, pc, 0.8) : mix(c, pc, 0.35 + 0.3 * h);
    }
    return c;
  }
  if (L == 3 || L == 4) {
    vec4 ov = texture(uOver, q / IMG);
    vec3 c = base * 0.62;
    if (L == 3) { c = mix(c, HID, ov.g); c = mix(c, SEEN, ov.r); }
    else { if ((f & 1) != 0) c = mix(c, base, 0.55); c = mix(c, HID, ov.a); c = mix(c, SEEN, ov.b); }
    return c;
  }
  float v = depthV(q);
  float m = metres(v);
  vec3 teal = vec3(0.17, 0.36, 0.34);
  vec3 c = mix(INK * 1.4, teal, smoothstep(0.0, 0.45, v));
  c = mix(c, PAPER * 0.92, smoothstep(0.45, 1.0, v));
  c = mix(c, base, 0.14);
  float k = m / 2.0;
  float cl = abs(fract(k - 0.5) - 0.5) / max(fwidth(k), 1e-4);
  c = mix(c, SEEN, (1.0 - clamp(cl, 0.0, 1.0)) * 0.55);
  c = mix(c, SEEN, border(q, 1, w));
  return c;
}

vec3 frame(vec2 p, vec2 fc, float px) {
  vec2 q = hover(p);
  vec3 smoothC = textureGrad(uRGB, q / IMG, vec2(px / IMG.x, 0.0), vec2(0.0, px / IMG.y)).rgb;
  vec3 base = uPixel > 0.0 ? mix(smoothC, texelFetch(uRGB, pix(q), 0).rgb, uPixel) : smoothC;
  float devPerPix = 1.0 / px;
  float w = clamp(1.3 / devPerPix, 0.04, 0.5);
  vec2 uv = vec2(fc.x / uRes.x, 1.0 - fc.y / uRes.y);
  float s = uv.x * 0.62 + uv.y * 0.38;                       // the wipe runs along this diagonal
  int L = s < uWipe ? uLayerB : uLayerA;
  vec3 col = L == 0 ? base : mix(base, annotate(L, q, base, w), uLayerMix);
  if (uWipe > 0.0 && uWipe < 1.0) col += SEEN * exp(-abs(s - uWipe) * 240.0) * 0.7;
  if (uHover > 0.5) {
    float id = pid(q);
    if (abs(id - uHover) < 0.5) col = mix(col, SEEN, 0.12 + 0.88 * idBorder(q, uHover, w));
    else col *= 0.8;
  }
  if (devPerPix > 7.0) {
    float grid = 1.0 - step(0.9 / devPerPix, min(fract(q.x), fract(q.y)));
    col = mix(col, col * 0.8, grid * 0.5 * uPixel);
  }
  if (uFocus > 0.0) {
    vec2 sc = fc / uRes - 0.5;
    col *= 1.0 - uFocus * 0.28 * dot(sc, sc) * 1.6;
    col += uFocus * (hash(fc + uSeed) - 0.5) * 0.03;
  }
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 tl = vec2(fc.x, uRes.y - fc.y);
  vec2 w = uCam.xy + (tl - 0.5 * uRes) * uCam.z;
  vec2 p = (w - uTile0) * IMG.x;                      // the active frame, in its pixels
  float px = uCam.z * IMG.x;                           // frame pixels per device pixel
  bool inFrame = uFrameMix > 0.0 && p.x >= 0.0 && p.y >= 0.0 && p.x < IMG.x && p.y < IMG.y;
  vec3 col;
  if (inFrame) {
    col = frame(p, fc, px);
    if (uFrameMix < 1.0) col = mix(wall(w), col, uFrameMix);
  } else {
    col = wall(w);
  }
  outColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load " + src));
    img.src = src;
  });
}
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function upload(gl, unit, source, { nearest = false, mips = false, raw = false, size } = {}) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, raw ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
  if (size) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Boxes and skeletons, drawn once per frame and packed one layer per channel:
// R visible box · G whole-body box · B joints and bones on the person · A the hidden ones.
function packOverlays(meta, scale) {
  const w = Math.round(IW * scale), h = Math.round(IH * scale);
  const layer = (paint) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.scale(scale, scale);
    g.lineJoin = "round"; g.lineCap = "round";
    g.strokeStyle = g.fillStyle = "#fff";
    paint(g);
    return g.getImageData(0, 0, w, h).data;
  };
  const people = meta.people;
  const vis = layer((g) => { g.lineWidth = 1.1; for (const p of people) { const [a, b, c, d] = p.vis_box; g.strokeRect(a, b, c - a, d - b); } });
  const full = layer((g) => {
    g.lineWidth = 1.1; g.setLineDash([2.6, 1.8]);
    for (const p of people) if (p.hidden > 0.05) { const [a, b, c, d] = p.full_box; g.strokeRect(a - 0.5, b - 0.5, c - a + 1, d - b + 1); }
  });
  const bones = (seen) => layer((g) => {
    for (const p of people) {
      if (!p.kps) continue;
      const k = p.kps;
      g.lineWidth = 1.05;
      for (const [a, b] of meta.links) {
        if (k[a][2] < 1 || k[b][2] < 1) continue;
        if ((k[a][2] === 2 && k[b][2] === 2) !== seen) continue;
        g.beginPath(); g.moveTo(k[a][0], k[a][1]); g.lineTo(k[b][0], k[b][1]); g.stroke();
      }
      for (const [x, y, v] of k) {
        if (v < 1 || (v === 2) !== seen) continue;
        g.beginPath(); g.arc(x, y, 1.0, 0, Math.PI * 2);
        if (seen) g.fill(); else { g.lineWidth = 0.6; g.stroke(); }
      }
    }
  });
  const on = bones(true), off = bones(false);
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = vis[i * 4 + 3];
    out[i * 4 + 1] = full[i * 4 + 3];
    out[i * 4 + 2] = on[i * 4 + 3];
    out[i * 4 + 3] = off[i * 4 + 3];
  }
  return { data: out, size: [w, h] };
}

function describe(p, layer) {
  if (!p) return "";
  const lines = [`Person ${String(p.i).padStart(2, "0")} · ${p.height_px} px tall · ${p.range_m.toFixed(1)} m away`];
  if (layer === 4 && p.kps) lines.push(`${p.kps.filter((k) => k[2] === 2).length} of 13 joints on their own pixels`);
  else if (layer === 5) lines.push(`${p.range_m.toFixed(1)} m along the line of sight`);
  else if (p.hidden >= 0.02) {
    const parts = [];
    if (p.hidden_scene >= 0.01) parts.push(`${Math.round(p.hidden_scene * 100)}% by the scene`);
    if (p.hidden_people >= 0.01) parts.push(`${Math.round(p.hidden_people * 100)}% by a person`);
    lines.push(`${Math.round(p.hidden * 100)}% hidden${parts.length ? ": " + parts.join(", ") : ""}`);
  } else lines.push("fully in view");
  return lines.join("\n");
}

// ---------------------------------------------------------------- the stage
export async function initStage(root, { reduced, onReady }) {
  const $ = (s) => root.querySelector(s);
  const stage = $("[data-stage]"), canvas = $("[data-gl]"), svg = $("[data-brackets]");
  const tag = $("[data-lens-tag]"), tagLayer = $("[data-tag-layer]"), tagWho = $("[data-tag-who]");
  const legend = $("[data-legend]"), cap = $("[data-wall-cap]"), back = $("[data-back]");
  const layerButtons = [...root.querySelectorAll("[data-mode]")];
  const sceneButtons = [...root.querySelectorAll("[data-scene]")];

  const coarse = matchMedia("(pointer: coarse)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("webgl2 unavailable");

  // --- the wall first: it is what the page opens on
  const small = coarse || Math.min(screen.width, screen.height) < 700;
  const wallBase = "assets/wall/";
  const [wallIndex, atlasImg, boxesImg] = await Promise.all([
    fetch(wallBase + "wall.json").then((r) => r.json()),
    loadImage(wallBase + (small ? "atlas-sm" : "atlas") + ".webp"),
    loadImage(wallBase + (small ? "boxes-sm" : "boxes") + ".webp"),
  ]);

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uAtlas", "uBoxes", "uRGB", "uData", "uOver", "uRes", "uCam", "uTile0", "uGrid", "uWallIn", "uWave",
    "uFrameMix", "uFocus", "uLayerA", "uLayerB", "uWipe", "uLayerMix", "uHover", "uPixel", "uPar", "uDepthRange", "uSeed"]) {
    U[n] = gl.getUniformLocation(prog, n);
  }
  ["uAtlas", "uBoxes", "uRGB", "uData", "uOver"].forEach((n, i) => gl.uniform1i(U[n], i));
  upload(gl, 0, atlasImg, { mips: true });
  upload(gl, 1, boxesImg, { mips: true, raw: true });
  gl.uniform1f(U.uGrid, wallIndex.cols);

  const tileOf = (place) => {
    const k = wallIndex.featured[place];
    return [(k % wallIndex.cols) * PX, Math.floor(k / wallIndex.cols) * PY];
  };
  const tileCentre = (tile) => [tile[0] + 0.5, tile[1] + 0.375];

  // --- frames: fetched as needed, uploaded only while they are the one on screen
  const cache = new Map();
  const overlayScale = coarse ? 1.25 : 2;
  const loadFrame = (i) => {
    if (!cache.has(i)) {
      const base = `assets/frames/${FRAMES[i].slug}/`;
      cache.set(i, Promise.all([
        fetch(base + "meta.json").then((r) => r.json()),
        loadImage(base + "rgb.webp"),
        loadImage(base + "data.webp"),
      ]).then(([meta, rgb, data]) => {
        const f = { meta, rgb, data, over: null };
        // Pack the overlays while nothing is happening, so a scene change never waits on it.
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
        idle(() => { if (!f.over) f.over = packOverlays(meta, overlayScale); });
        return f;
      }));
    }
    return cache.get(i);
  };

  const state = {
    cssW: 0, cssH: 0, dpr: 1,
    cam: { cx: 0, cy: 0, k: 1 },            // wall units per css px
    i: -1, meta: null, tile0: [0, 0], star: null, candidates: [],
    phase: "wall", t0: performance.now(), arrivedAt: 0,
    wallIn: 0, wave: -99, waveT0: null, frameMix: 0, focus: 0,
    layerA: 0, layerB: 0, wipe: 0, wipeT0: null, layerMix: 1,
    hover: null, zoomed: null, pinned: false,
    lastInput: -1e9, timers: [],
    visible: true, running: false, seed: 0, flight: null, busy: true,
  };
  let gpu = null;
  function activate(i, f) {
    if (gpu) gpu.forEach((t) => gl.deleteTexture(t));
    const over = f.over || (f.over = packOverlays(f.meta, overlayScale));
    gpu = [upload(gl, 2, f.rgb, { mips: true }), upload(gl, 3, f.data, { nearest: true, raw: true }), upload(gl, 4, over.data, { size: over.size, raw: true })];
    gl.uniform2f(U.uDepthRange, f.meta.depth_near_m, f.meta.depth_far_m);
    state.i = i; state.meta = f.meta;
    state.tile0 = tileOf(FRAMES[i].place);
    const score = (p) => p.height_px * (1 - Math.abs(0.45 - p.hidden)) * (p.hidden > 0.15 ? 1.6 : 1) * (p.hidden_people > 0.1 && p.hidden_scene > 0.05 ? 1.5 : 1);
    state.candidates = f.meta.people.filter((p) => p.height_px >= 26 && p.hidden < 0.9).sort((a, b) => score(b) - score(a));
    state.star = state.candidates[0] || f.meta.people[0];     // the person the camera will close in on
    fillHud(root, f.meta);
    sceneButtons.forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
  }

  // --- cameras, all in wall units: a frame's tile is 1 wide, so 1 frame pixel is 1/IW
  function heroCam() {
    const W = state.cssW, H = state.cssH, narrow = W < 760;
    const s = Math.max(W / IW, H / IH), vw = W / s, vh = H / s;
    const f = state.star.centroid;
    const ox = clamp(f[0] - vw * 0.5, 0, IW - vw), oy = clamp(f[1] - vh * (narrow ? 0.5 : 0.46), 0, IH - vh);
    const [tx, ty] = state.tile0;
    return { cx: tx + (ox + vw / 2) / IW, cy: ty + (oy + vh / 2) / IW, k: 1 / (s * IW) };
  }
  function personCam(p) {
    const W = state.cssW, H = state.cssH, narrow = W < 760;
    const s = clamp((narrow ? 0.3 : 0.4) * H / Math.max(p.height_px, 12), 2.2, 7.5);
    const vw = W / s, vh = H / s;
    // on a wide screen the person sits left of centre, clear of the headline
    const cx = clamp(p.centroid[0] + (narrow ? 0 : 0.17 * vw), vw / 2, IW - vw / 2);
    const cy = clamp((p.full_box[1] + p.full_box[3]) / 2 + (narrow ? 0.06 * vh : 0), vh / 2, IH - vh / 2);
    const [tx, ty] = state.tile0;
    return { cx: tx + cx / IW, cy: ty + cy / IW, k: 1 / (s * IW) };
  }
  function wallCam(cx, cy) {
    const across = state.cssW < 760 ? 3.3 : 6.2;
    return { cx, cy, k: (across * PX) / state.cssW };
  }
  function view() {
    const s = 1 / (state.cam.k * IW);
    return { s, ox: (state.cam.cx - state.cssW / 2 * state.cam.k - state.tile0[0]) * IW, oy: (state.cam.cy - state.cssH / 2 * state.cam.k - state.tile0[1]) * IW };
  }
  const toCss = (ix, iy) => { const v = view(); return [(ix - v.ox) * v.s, (iy - v.oy) * v.s]; };
  const toImage = (x, y) => { const v = view(); const r = stage.getBoundingClientRect(); return [v.ox + (x - r.left) / v.s, v.oy + (y - r.top) / v.s]; };

  // Fly so that the destination's centre glides to the middle of the screen while the zoom
  // changes: its on-screen offset shrinks with the eased time, whatever the scale does.
  function fly(to, ms) {
    if (state.flight) state.flight.resolve();
    const from = { ...state.cam };
    if (reduced) { state.cam = { ...to }; return Promise.resolve(); }
    return new Promise((resolve) => { state.flight = { from, to, ms, t0: performance.now(), resolve }; kick(); });
  }
  function stepFlight(now) {
    const f = state.flight;
    const u = clamp((now - f.t0) / f.ms, 0, 1);
    const t = easeInOut(u);
    const k = Math.exp(lerp(Math.log(f.from.k), Math.log(f.to.k), t));
    const d0x = (f.to.cx - f.from.cx) / f.from.k, d0y = (f.to.cy - f.from.cy) / f.from.k;
    state.cam = { cx: f.to.cx - d0x * (1 - t) * k, cy: f.to.cy - d0y * (1 - t) * k, k };
    if (u >= 1) { state.cam = { ...f.to }; state.flight = null; f.resolve(); }
  }

  // --- brackets that lock onto every person as a place arrives
  function buildBrackets() {
    svg.textContent = "";
    svg.classList.remove("is-on", "is-fading");
    const ns = "http://www.w3.org/2000/svg";
    const [fx, fy] = state.star.centroid;
    for (const p of state.meta.people) {
      const [x0, y0, x1, y1] = p.vis_box;
      const a = Math.max(2.5, Math.min(7, (x1 - x0) / 3, (y1 - y0) / 3)), e = 2;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M${x0 - e} ${y0 - e + a}V${y0 - e}H${x0 - e + a}M${x1 + e - a} ${y0 - e}H${x1 + e}V${y0 - e + a}M${x1 + e} ${y1 + e - a}V${y1 + e}H${x1 + e - a}M${x0 - e + a} ${y1 + e}H${x0 - e}V${y1 + e - a}`);
      path.style.setProperty("--d", (0.05 + Math.hypot(p.centroid[0] - fx, p.centroid[1] - fy) / 1500).toFixed(2) + "s");
      svg.appendChild(path);
    }
    placeBrackets();
  }
  function placeBrackets() {
    const v = view();
    svg.setAttribute("viewBox", `0 0 ${IW} ${IH}`);
    svg.style.width = IW * v.s + "px";
    svg.style.height = IH * v.s + "px";
    svg.style.transform = `translate(${-v.ox * v.s}px, ${-v.oy * v.s}px)`;
  }

  // --- layers: a diagonal wipe carries the frame from one to the next
  function setLayer(L, { instant = false } = {}) {
    const shown = state.wipeT0 != null ? state.layerB : state.layerA;
    layerButtons.forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.mode) + 1 === L)));
    legend.innerHTML = LAYERS[L].legend;
    tagLayer.textContent = LAYERS[L].name;
    if (L === shown) return;
    if (instant || reduced) { state.layerA = state.layerB = L; state.wipeT0 = null; state.wipe = 0; }
    else { state.layerA = shown; state.layerB = L; state.wipeT0 = performance.now(); }
    updateTag(true);
    kick();
  }
  layerButtons.forEach((b) => b.addEventListener("click", () => { state.pinned = true; state.lastInput = performance.now(); clearReel(); setLayer(Number(b.dataset.mode) + 1); }));
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !state.visible || state.phase !== "frame") return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 5) { state.pinned = true; state.lastInput = performance.now(); clearReel(); setLayer(n); }
    if (e.key === "Escape" && state.zoomed) unzoom();
  });

  // --- people under the pointer, and a label that says what the ground truth knows of them
  function personAt(ix, iy) {
    let best = null, bestA = Infinity;
    for (const p of state.meta.people) {
      const [x0, y0, x1, y1] = p.full_box;
      const pad = 3 / view().s + 1;
      if (ix < x0 - pad || ix > x1 + pad || iy < y0 - pad || iy > y1 + pad) continue;
      const a = (x1 - x0) * (y1 - y0);                    // the smallest box that holds the point wins
      if (a < bestA) { bestA = a; best = p; }
    }
    return best;
  }
  function currentLayer() { return state.wipeT0 != null ? state.layerB : state.layerA; }
  function labelled() { return state.hover || (state.zoomed && state.phase === "frame" ? state.zoomed : null); }
  function updateTag(force) {
    const p = state.phase === "frame" ? labelled() : null;
    if (!p) { tag.classList.remove("is-on"); state.tagFor = null; return; }
    if (force || state.tagFor !== p || state.tagLayer !== currentLayer()) {
      state.tagFor = p; state.tagLayer = currentLayer();
      tagWho.textContent = describe(p, currentLayer());
      tagLayer.textContent = currentLayer() === 0 ? "Ground truth" : LAYERS[currentLayer()].name;
    }
    const [x0, y0] = toCss(p.full_box[0], p.full_box[1]);
    const [x1, y1] = toCss(p.full_box[2], p.full_box[3]);
    const tw = tag.offsetWidth || 220, th = tag.offsetHeight || 52, W = state.cssW, H = state.cssH, m = 10;
    let x = (x0 + x1) / 2 - tw / 2, y = y0 - th - 12;
    if (y < 60) y = y1 + 12;
    x = clamp(x, m, W - tw - m); y = clamp(y, 60, H - th - m);
    tag.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    tag.classList.add("is-on");
  }

  stage.addEventListener("pointermove", (e) => {
    if (state.phase !== "frame" || e.pointerType !== "mouse" || !fine) return;
    const p = personAt(...toImage(e.clientX, e.clientY));
    state.lastInput = performance.now();
    if (p !== state.hover) { state.hover = p; stage.style.cursor = p ? "zoom-in" : ""; updateTag(true); kick(); }
  });
  stage.addEventListener("pointerleave", () => { if (state.hover) { state.hover = null; stage.style.cursor = ""; updateTag(true); kick(); } });
  stage.addEventListener("click", (e) => {
    if (state.phase !== "frame" || state.busy) return;
    state.lastInput = performance.now();
    const p = personAt(...toImage(e.clientX, e.clientY));
    if (p && p !== state.zoomed) zoomTo(p, true);
    else if (state.zoomed) unzoom();
  });
  back && back.addEventListener("click", (e) => { e.stopPropagation(); unzoom(); });

  async function zoomTo(p, byUser) {
    if (byUser) { state.pinned = true; clearReel(); }
    state.zoomed = p;
    root.classList.add("is-zoomed");
    svg.classList.add("is-fading");
    if (currentLayer() === 0) setLayer(1);
    updateTag(true);
    await fly(personCam(p), byUser ? 1300 : 1800);
  }
  async function unzoom() {
    if (!state.zoomed) return;
    state.zoomed = null;
    root.classList.remove("is-zoomed");
    updateTag(true);
    await fly(heroCam(), 1100);
  }

  // --- what a place does on its own, until somebody steers
  function clearReel() { state.timers.forEach(clearTimeout); state.timers = []; }
  function startReel() {
    clearReel();
    if (reduced) return;
    const at = (s, fn) => state.timers.push(setTimeout(fn, s * 1000));
    // a step waits while somebody is pointing at the frame; it never moves under their hand
    const step = (L, closeIn) => () => {
      if (state.phase !== "frame" || state.pinned) return;
      if (performance.now() - state.lastInput < 4000) { at(2, step(L, closeIn)); return; }
      setLayer(L);
      if (closeIn && state.star) zoomTo(state.star, false);
    };
    for (const [s, L, closeIn] of REEL) at(s, step(L, closeIn));
  }

  // --- the loop runs while something moves; the hover keeps it running on a frame
  let last = performance.now();
  function kick() {
    if (!state.running && state.visible && !document.hidden) {
      state.running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;
    if (state.flight) { stepFlight(now); moving = true; }
    if (state.wallIn < 1) { state.wallIn = Math.min(1, (now - state.t0) / 1100); moving = true; }
    if (state.phase === "wall" && !reduced) { state.cam.cx += dt * 0.05; state.cam.cy += dt * 0.022; moving = true; }
    if (state.waveT0 != null) {
      const u = (now - state.waveT0) / 2600;
      const c = state.cam, W = state.cssW * c.k, H = state.cssH * c.k;
      const a = (c.cx - W / 2) * 0.83 + (c.cy - H / 2) * 0.56 - 1.5, b = (c.cx + W / 2) * 0.83 + (c.cy + H / 2) * 0.56 + 1.5;
      state.wave = u < 1 ? lerp(a, b, easeOut(u)) : -99;
      if (u >= 1) state.waveT0 = null; else moving = true;
    }
    if (state.wipeT0 != null) {
      const u = (now - state.wipeT0) / 1150;
      state.wipe = u < 1 ? lerp(-0.05, 1.05, easeInOut(u)) : 0;
      if (u >= 1) { state.layerA = state.layerB; state.wipeT0 = null; updateTag(true); } else moving = true;
    }
    const focusTo = state.phase === "frame" ? 1 : 0;
    if (Math.abs(state.focus - focusTo) > 0.001) { state.focus += (focusTo - state.focus) * (1 - Math.exp(-dt * 5)); moving = true; }
    else state.focus = focusTo;
    // outside a place the annotations fade, so the wall and the flights stay clean
    const mixTo = state.phase === "frame" || state.phase === "out" && state.focus > 0.3 ? 1 : 0;
    if (Math.abs(state.layerMix - mixTo) > 0.001) { state.layerMix += (mixTo - state.layerMix) * (1 - Math.exp(-dt * 6)); moving = true; }

    // drone hover: a slow drift of the viewpoint, read through the frame's own depth,
    // scaled down when the camera has closed in so a few pixels stay a few pixels
    let par = [0, 0];
    if (!reduced && state.focus > 0.001) {
      const t = now / 1000, zoom = clamp(heroScale() / (1 / (state.cam.k * IW)), 0.15, 1);
      par = [Math.sin(t * 0.21) * 4.2 * state.focus * zoom, Math.sin(t * 0.17 + 1.3) * 3.2 * state.focus * zoom];
      moving = true;
    }
    const cssPerPix = 1 / (state.cam.k * IW);
    const pixel = smoothstep(2.6, 4.2, cssPerPix);

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform4f(U.uCam, state.cam.cx, state.cam.cy, state.cam.k / state.dpr, 0);
    gl.uniform2f(U.uTile0, state.tile0[0], state.tile0[1]);
    gl.uniform1f(U.uWallIn, state.wallIn);
    gl.uniform1f(U.uWave, state.wave);
    gl.uniform1f(U.uFrameMix, state.frameMix);
    gl.uniform1f(U.uFocus, state.focus);
    gl.uniform1i(U.uLayerA, state.layerA);
    gl.uniform1i(U.uLayerB, state.layerB);
    gl.uniform1f(U.uWipe, state.wipeT0 != null ? state.wipe : 0);
    gl.uniform1f(U.uLayerMix, state.layerMix);
    gl.uniform1f(U.uHover, state.hover && state.phase === "frame" ? state.hover.i : 0);
    gl.uniform1f(U.uPixel, pixel);
    gl.uniform2f(U.uPar, par[0], par[1]);
    gl.uniform1f(U.uSeed, (state.seed = (state.seed + 1) % 997));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (state.phase === "frame" && (state.hover || state.zoomed)) updateTag(false);

    // a place stays until it has had its time and nobody is steering
    const since = (now - state.arrivedAt) / 1000;
    const idle = (now - state.lastInput) / 1000;
    if (!reduced && state.phase === "frame" && !state.busy) {
      const due = state.pinned ? idle > 22 : since > DWELL && idle > 6;
      if (due) go((state.i + 1) % FRAMES.length);
    }
    root.style.setProperty("--dwell", state.phase === "frame" && !reduced && !state.pinned ? clamp(since / DWELL, 0, 1).toFixed(3) : "0");

    if (moving && state.visible && !document.hidden) requestAnimationFrame(loop);
    else state.running = false;
  }
  let heroS = 1;
  const heroScale = () => heroS;

  function layout() {
    const r = stage.getBoundingClientRect();
    state.cssW = r.width; state.cssH = r.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
    canvas.width = Math.round(r.width * state.dpr);
    canvas.height = Math.round(r.height * state.dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    heroS = Math.max(r.width / IW, r.height / IH);
    if (state.phase === "frame" && !state.flight) { state.cam = state.zoomed ? personCam(state.zoomed) : heroCam(); placeBrackets(); }
    kick();
  }

  // --- moving between places: back out to the wall, across, and in
  async function go(i) {
    if (state.busy || i === state.i) return;
    state.busy = true;
    clearReel();
    const next = loadFrame(i);
    state.hover = null; state.zoomed = null; updateTag(true);
    root.classList.remove("is-zoomed");
    svg.classList.add("is-fading");
    root.classList.add("is-flying");
    if (reduced) {
      activate(i, await next);
      state.cam = heroCam();
      arrive();
      return;
    }
    state.phase = "out";
    const a = tileCentre(state.tile0), b = tileCentre(tileOf(FRAMES[i].place));
    const mid = wallCam((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1.6;
    mid.k = Math.max(mid.k, (span * 0.9) / Math.min(state.cssW, state.cssH * 1.4));
    await fly(mid, 1700);
    activate(i, await next);            // at the far point both tiles are small: swap unseen
    setLayer(0, { instant: true });
    state.phase = "dive";
    await fly(heroCam(), 1900);
    arrive();
  }

  function arrive() {
    state.phase = "frame";
    state.arrivedAt = performance.now();
    state.pinned = false;
    state.busy = false;
    root.classList.remove("is-flying");
    buildBrackets();
    if (reduced) setLayer(1, { instant: true });
    requestAnimationFrame(() => svg.classList.add("is-on"));
    startReel();                        // clears old timers, so it runs before the bracket fade is queued
    state.timers.push(setTimeout(() => svg.classList.add("is-fading"), reduced ? 0 : 2400));
    kick();
  }
  sceneButtons.forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.lastInput = performance.now(); go(Number(b.dataset.scene)); }));
  // the place cards further down ask for a place by name
  window.addEventListener("edapa:go", (e) => {
    const i = Number(e.detail);
    state.lastInput = performance.now();
    if (i === state.i) return;
    const tryGo = () => (state.busy ? setTimeout(tryGo, 400) : go(i));
    setTimeout(tryGo, reduced ? 0 : 500);        // let the page scroll up first
  });

  new ResizeObserver(layout).observe(stage);
  new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; if (state.visible) kick(); }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });

  // ---------------------------------------------------------------- choreography
  layout();
  setLayer(0, { instant: true });
  root.classList.add("gl-on");
  document.documentElement.classList.add("gl-on");
  const first = loadFrame(0);
  first.then(() => FRAMES.forEach((_, k) => k && setTimeout(() => loadFrame(k), 400 * k)));

  if (reduced) {
    activate(0, await first);
    state.frameMix = 1; state.focus = 1; state.wallIn = 1;
    state.cam = heroCam();
    arrive();
    onReady && onReady();
    return { setLayer, go };
  }

  // A tab opened in the background waits: the opening is for whoever is looking.
  if (document.hidden) {
    await new Promise((resolve) => {
      const h = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", h); resolve(); } };
      document.addEventListener("visibilitychange", h);
    });
  }
  // open on the wall, a little off the first place so the dive travels
  state.tile0 = tileOf(FRAMES[0].place);
  const t0c = tileCentre(state.tile0);
  state.cam = wallCam(t0c[0] - 1.35, t0c[1] - 0.55);
  state.t0 = performance.now();
  cap && cap.classList.add("is-on");
  setTimeout(() => { state.waveT0 = performance.now(); kick(); }, 350);
  kick();
  const f0 = await first;
  await new Promise((r) => setTimeout(r, Math.max(0, 2500 - (performance.now() - state.t0))));
  activate(0, f0);
  state.frameMix = 1;
  cap && cap.classList.remove("is-on");
  state.phase = "dive";
  root.classList.add("is-flying");
  setTimeout(() => onReady && onReady(), 900);
  await fly(heroCam(), 2100);
  arrive();
  return { setLayer, go };
}

function fillHud(root, m) {
  const set = (sel, v) => { const el = root.querySelector(sel); if (el && v != null) el.textContent = v; };
  const partial = m.people.filter((p) => p.hidden > 0.05 && p.hidden < 0.97).length;
  set("[data-hud-time]", m.local_time);
  set("[data-hud-sky]", m.weather ? m.weather[0].toUpperCase() + m.weather.slice(1) : null);
  set("[data-hud-alt]", m.altitude_m != null ? `${m.altitude_m.toFixed(1)} m` : null);
  set("[data-hud-cam]", `${m.camera_depression_deg.toFixed(1)}° down`);
  set("[data-hud-people]", `${m.people_listed} · ${partial} partly hidden`);
}
