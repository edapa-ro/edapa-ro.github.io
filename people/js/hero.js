// The opening: one crowd seen from a drone, rewritten cast after cast by a wave.
//
// Every cast stands on the same places (one slot per person, the same camera), so a wave can swap
// whole people: each person's pixels change when the wave reaches the middle of that person, the ground
// and its shadows change where the wave is. Where an old person and a new one cover the same pixel
// between their two moments, the empty ground shows (assets/casts/ground.webp).

const VS = `#version 300 es
in vec2 p;
out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uA, uB, uG, uSA, uSB, uCA, uCB;
uniform vec2 uOrigin;
uniform float uR, uAspect;
uniform vec4 uCover;
float dist(vec2 a, vec2 b) { return length((a - b) * vec2(uAspect, 1.0)); }
void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y);
  vec2 uv = s * uCover.xy + uCover.zw;
  vec3 a = texture(uA, uv).rgb, b = texture(uB, uv).rgb, g = texture(uG, uv).rgb;
  float sa = floor(texture(uSA, uv).r * 255.0 + 0.5), sb = floor(texture(uSB, uv).r * 255.0 + 0.5);
  float tPix = dist(uv, uOrigin);
  float tA = sa > 0.5 ? dist(texelFetch(uCA, ivec2(int(sa), 0), 0).xy, uOrigin) : tPix;
  float tB = sb > 0.5 ? dist(texelFetch(uCB, ivec2(int(sb), 0), 0).xy, uOrigin) : tPix;
  vec3 col = uR < tA ? a : (uR >= tB ? b : g);
  vec3 lime = vec3(0.776, 0.949, 0.306);
  float ground = (sa < 0.5 && sb < 0.5) ? 1.0 : 0.0;
  float ring = exp(-pow((tPix - uR) / 0.0032, 2.0));
  float halo = exp(-pow((tPix - uR) / 0.045, 2.0)) * step(tPix, uR);
  col = mix(col, lime, clamp(ring * 0.9 * ground + halo * 0.10 * ground, 0.0, 1.0));
  float fresh = (sb > 0.5 && uR >= tB) ? exp(-(uR - tB) / 0.03) : 0.0;
  col = mix(col, lime, fresh * 0.5);
  o = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("cannot load " + src));
    im.src = src;
  });
}

function texture(gl, image, { mono = false } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (mono) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  const f = mono ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function centres(gl, meta) {
  // One texel per slot: the middle of that person's pixels, in the picture's 0..1.
  const data = new Float32Array(256 * 2);
  for (const [k, p] of Object.entries(meta.slots)) {
    data[k * 2] = p.centre[0];
    data[k * 2 + 1] = p.centre[1];
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 256, 1, 0, gl.RG, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return t;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function initHero(root, { reduced, onReady }) {
  const canvas = root.querySelector("[data-gl]");
  const tagsEl = root.querySelector("[data-tags]");
  const hudN = root.querySelector("[data-hud-n]");
  const hudName = root.querySelector("[data-hud-name]");
  const list = await (await fetch("assets/casts/casts.json")).json();
  if (reduced) { onReady(); return; }
  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error("no WebGL2");

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);

  // Every cast, loaded once.
  const ground = texture(gl, await loadImage("assets/casts/ground.webp"));
  // Each cast loaded when it is about to be needed: the first two at once, the next while the current wave runs.
  async function loadCast(c) {
    const [img, slots, meta] = await Promise.all([
      loadImage(`assets/casts/${c.name}/crowd.webp`), loadImage(`assets/casts/${c.name}/slots.png`),
      fetch(`assets/casts/${c.name}/cast.json`).then((r) => r.json())]);
    // The slots also on the CPU, to know who is under the pointer.
    const cv = document.createElement("canvas");
    cv.width = slots.width; cv.height = slots.height;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(slots, 0, 0);
    const map = cx.getImageData(0, 0, slots.width, slots.height).data;
    return { ...c, rgb: texture(gl, img), slots: texture(gl, slots, { mono: true }), cent: centres(gl, meta), meta,
             map, mw: slots.width, mh: slots.height };
  }
  const pending = list.map(() => null);
  const want = (i) => { i %= list.length; return (pending[i] = pending[i] || loadCast(list[i])); };
  const casts = await Promise.all([want(0), want(1)]);
  const castAt = (i) => casts[i % list.length];
  const [iw, ih] = casts[0].meta.size;
  const aspect = iw / ih;

  let cw = 1, ch = 1, k = [1, 1], base = [1, 1], off = [0, 0];
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const ca = cw / ch;
    base = ca > aspect ? [1, aspect / ca] : [ca / aspect, 1];
    drift(performance.now());
  }
  // The drone holds its place the way a drone does: a slow drift and a breath of zoom, never still.
  function drift(now) {
    const t = now / 1000;
    const z = 1.045 + 0.02 * Math.sin(t / 11);
    k = [base[0] / z, base[1] / z];
    off = [0.5 - 0.5 * k[0] + 0.012 * Math.sin(t / 13), 0.5 - 0.5 * k[1] + 0.009 * Math.cos(t / 17)];
    gl.uniform4f(U("uCover"), k[0], k[1], off[0], off[1]);
  }
  window.addEventListener("resize", resize);
  resize();
  gl.uniform1f(U("uAspect"), aspect);
  ["uA", "uB", "uG", "uSA", "uSB", "uCA", "uCB"].forEach((n, i) => gl.uniform1i(U(n), i));
  const bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };

  const toScreen = (u, v) => [((u - off[0]) / k[0]) * cw, ((v - off[1]) / k[1]) * ch];
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]);

  let ia = 0, wave = null, originNow = [0.5, 0.5], rNow = 0;
  const waveR = () => rNow;
  async function startWave() {
    // The next cast, waited for if it is still on its way; the one after it starts loading now.
    if (!casts[(ia + 1) % list.length]) casts[(ia + 1) % list.length] = await want(ia + 1);
    want(ia + 2).then((c) => { casts[(ia + 2) % list.length] = c; });
    const A = castAt(ia), B = castAt(ia + 1);
    bind(0, A.rgb); bind(1, B.rgb); bind(2, ground); bind(3, A.slots); bind(4, B.slots); bind(5, A.cent); bind(6, B.cent);
    // The wave starts at someone in the middle of what is on screen.
    const seen = Object.values(B.meta.slots).filter((p) => {
      const [x, y] = toScreen(...p.centre);
      return x > cw * 0.45 && x < cw * 0.9 && y > ch * 0.2 && y < ch * 0.75;
    });
    const from = (seen.length ? seen : Object.values(B.meta.slots))[Math.floor(Math.random() * Math.max(1, seen.length))];
    const origin = from ? from.centre : [0.6, 0.5];
    originNow = origin;
    gl.uniform2f(U("uOrigin"), origin[0], origin[1]);
    const far = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map((c) => dist(c, origin)));
    // Three new people get their words, spread over the wave.
    const picks = Object.values(B.meta.slots)
      .map((p) => ({ p, d: dist(p.centre, origin), xy: toScreen(...p.centre) }))
      .filter((q) => q.d > 0.06 && q.xy[0] > cw * 0.42 && q.xy[0] < cw * 0.95 && q.xy[1] > ch * 0.16 && q.xy[1] < ch * 0.72)
      .sort(() => Math.random() - 0.5).slice(0, 3);
    tagsEl.textContent = "";
    const tags = picks.map((q) => {
      const el = document.createElement("div");
      el.className = "p-tag";
      el.innerHTML = '<span class="chip is-new"></span><i></i>';
      tagsEl.appendChild(el);
      return { ...q, el, shown: false };
    });
    hudN.textContent = String((ia + 1) % list.length + 1).padStart(2, "0");
    hudName.textContent = B.title || B.name;
    wave = { t0: performance.now(), dur: 2600 + far * 1600, far, tags };
  }

  function type(el, text) {
    let i = 0;
    const step = () => { el.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(step, 18); };
    step();
  }

  let ready = false;
  function frame(now) {
    drift(now);
    if (!wave) gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (const q of wave ? wave.tags : []) {
      const [x, yTop] = toScreen(q.p.centre[0], q.p.box[1]);
      q.el.style.transform = `translate3d(${Math.round(x - 10)}px, ${Math.round(yTop - 64)}px, 0)`;
    }
    if (wave) {
      const t = Math.min(1, (now - wave.t0) / wave.dur);
      const r = ease(t) * wave.far;
      rNow = r;
      gl.uniform1f(U("uR"), r);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (const q of wave.tags) {
        if (!q.shown && r >= q.d) {
          q.shown = true;
          q.el.classList.add("is-on");
          type(q.el.querySelector(".chip"), q.p.label);
          setTimeout(() => q.el.classList.remove("is-on"), 2600);
        }
      }
      if (!ready) { ready = true; root.classList.add("gl-on"); onReady(); }
      if (t >= 1) {
        ia = (ia + 1) % list.length;
        wave = null;
        // The finished cast stays drawn (uR past everyone) until the next wave starts from it.
        setTimeout(startWave, 1700);
      }
    }
    requestAnimationFrame(frame);
  }
  // Pointing at someone in the crowd: their words, on a bracket that locks onto them.
  const lens = document.createElement("div");
  lens.className = "p-lens";
  lens.innerHTML = '<span class="p-lens__box"></span><span class="chip"></span>';
  root.appendChild(lens);
  const lensBox = lens.firstChild, lensChip = lens.lastChild;
  let lensSlot = 0;
  root.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const u = off[0] + ((e.clientX - r.left) / r.width) * k[0];
    const v = off[1] + ((e.clientY - r.top) / r.height) * k[1];
    // The cast on screen at that point: between waves the one the last wave left; during a wave, the new one where
    // the wave has passed.
    const C = !wave ? castAt(ia) : (waveR() >= dist([u, v], originNow) ? castAt(ia + 1) : castAt(ia));
    if (!C) return;
    const px = Math.floor(u * C.mw), py = Math.floor(v * C.mh);
    // Within a few pixels of a person counts: they are small.
    let slot = 0;
    for (let d = 0; d <= 6 && !slot; d += 2) {
      for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) {
        const x = px + dx, y = py + dy;
        if (x >= 0 && y >= 0 && x < C.mw && y < C.mh && C.map[(y * C.mw + x) * 4]) { slot = C.map[(y * C.mw + x) * 4]; break; }
      }
    }
    const p = slot && C.meta.slots[String(slot)];
    if (!p) { lens.classList.remove("is-on"); lensSlot = 0; return; }
    const [x0, y0] = toScreen(p.box[0], p.box[1]), [x1, y1] = toScreen(p.box[2], p.box[3]);
    lensBox.style.transform = `translate(${x0 - 5}px, ${y0 - 5}px)`;
    lensBox.style.width = `${x1 - x0 + 10}px`;
    lensBox.style.height = `${y1 - y0 + 10}px`;
    lensChip.style.transform = `translate(${x1 + 12}px, ${y0 - 4}px)`;
    if (slot !== lensSlot) { lensChip.textContent = p.label; lensSlot = slot; }
    lens.classList.add("is-on");
  });
  root.addEventListener("pointerleave", () => lens.classList.remove("is-on"));

  gl.uniform1f(U("uR"), 0);
  startWave();
  requestAnimationFrame(frame);
}
