// Scene 3: the wall. Two thousand people written from words, nobody twice, drawn as one instanced batch per
// texture sheet. A word (children, at work, hijab...) brings the people it finds forward and dims the rest; three
// arrangements (a grid, the age pyramid, one sentence's people) move them like a flock: each person a little
// after the one before, on --ease-out.

const VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 rect;     // where on screen, px: x of the feet, y of the ground, width, height
layout(location=2) in vec4 uvRect;   // the tile in its sheet, 0..1
layout(location=3) in vec2 look;     // alpha, lift (0..1, for the ones a word finds)
uniform vec2 uView;
out vec2 vUv;
out float vAlpha;
void main() {
  vec2 px = vec2(rect.x - rect.z * 0.5 + corner.x * rect.z, rect.y - rect.w + corner.y * rect.w);
  vUv = uvRect.xy + corner * uvRect.zw;
  vAlpha = look.x;
  gl_Position = vec4(px.x / uView.x * 2.0 - 1.0, 1.0 - px.y / uView.y * 2.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUv;
in float vAlpha;
uniform sampler2D uSheet;
out vec4 o;
void main() {
  vec4 c = texture(uSheet, vUv);
  o = vec4(c.rgb * vAlpha, c.a * vAlpha);
}`;

const AGES = ["toddler", "child", "teen", "adult", "elderly"];

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

const outCubic = (t) => 1 - Math.pow(1 - t, 3);

export async function initWall(root, { reduced, words }) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const meta = await (await fetch("assets/wall/wall.json")).json();
  const canvas = root.querySelector("[data-wall-canvas]");
  const card = root.querySelector("[data-wall-card]");
  const countEl = root.querySelector("[data-wall-count]");
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) throw new Error("no WebGL2");
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const sheets = await Promise.all([...Array(meta.sheets).keys()].map((k) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      res(t);
    };
    im.onerror = rej;
    im.src = `assets/wall/sheet_${k}.webp`;
  })));

  // The people, shuffled once so the grid mixes everyone.
  // A phone gets a smaller wall: the first 600 people.
  const people = meta.people.slice(0, window.innerWidth < 700 ? 600 : meta.people.length)
    .map((p, i) => ({ ...p, i, view: Math.random() < 0.5 ? "+0" : "-35" }));
  for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [people[i], people[j]] = [people[j], people[i]]; }
  const N = people.length;
  countEl.textContent = new Intl.NumberFormat("en-US").format(N);

  // Per person: from, to, and the moment their move starts.
  const cur = people.map(() => ({ x: 0, y: 0, s: 1, a: 1 }));
  const from = people.map(() => ({ x: 0, y: 0, s: 1, a: 1 }));
  const to = people.map(() => ({ x: 0, y: 0, s: 1, a: 1 }));
  const delay = new Float32Array(N);
  let t0 = 0, dur = reduced ? 1 : 900;

  let W = 1, H = 1;
  function layoutGrid() {
    // Cells as wide as an adult's shoulders at this scale, rows as tall as an adult.
    const unit = Math.sqrt((W * H * 0.92) / N);
    const cols = Math.max(8, Math.floor(W / (unit * 0.62)));
    const cw = W / cols, rows = Math.ceil(N / cols), ch = (H - 8) / rows;
    return people.map((p, k) => ({ x: (k % cols + 0.5) * cw, y: (Math.floor(k / cols) + 1) * ch - 2, s: ch * 0.96, a: 1 }));
  }
  function layoutPyramid() {
    // Women to the left of the middle, men to the right, each age a band, the old at the top.
    const bands = AGES.slice().reverse();
    const bh = (H - 30) / bands.length;
    const out = new Array(N);
    const fill = {}, count = {};
    people.forEach((p) => {
      const w = p.words[0];
      const key = Math.max(0, bands.indexOf(w.age)) + ":" + (w.sex === "female" ? -1 : 1);
      count[key] = (count[key] || 0) + 1;
    });
    // The fullest band fills half the width on its side: the pyramid's shape is the counts'.
    const most = Math.max(...Object.values(count));
    const step = Math.min(bh * 0.33, (W * 0.47) / most);
    const s = Math.min(bh * 0.92, step * 2.8);
    people.forEach((p, k) => {
      const w = p.words[0];
      const b = Math.max(0, bands.indexOf(w.age));
      const side = w.sex === "female" ? -1 : 1;
      const key = b + ":" + side;
      const n = (fill[key] = (fill[key] || 0) + 1);
      out[k] = { x: W / 2 + side * (n - 0.5) * step, y: 20 + (b + 1) * bh, s, a: 1 };
    });
    return out;
  }
  function layoutSentence(match) {
    // The people of one sentence, large, in a row; everyone else gone.
    const chosen = people.map((p, k) => (match(p) ? k : -1)).filter((k) => k >= 0).slice(0, 12);
    const s = Math.min(H * 0.62, (W / Math.max(6, chosen.length)) * 2.2);
    const gap = Math.min(W / (chosen.length + 1), s * 0.52);
    const x0 = W / 2 - (gap * (chosen.length - 1)) / 2;
    const out = cur.map((c) => ({ ...c, a: 0 }));
    chosen.forEach((k, j) => { out[k] = { x: x0 + j * gap, y: H * 0.86, s, a: 1 }; });
    return out;
  }

  let mode = "grid", filter = null;
  const finds = (p) => !filter || p.kinds.includes(filter);
  function arrange() {
    let target = mode === "pyramid" ? layoutPyramid() : mode === "sentence" ? layoutSentence(sentence) : layoutGrid();
    if (filter && mode !== "sentence") target = target.map((t, k) => (finds(people[k]) ? { ...t, s: t.s * 1.18 } : { ...t, a: 0.13 }));
    const now = performance.now();
    people.forEach((p, k) => {
      Object.assign(from[k], cur[k]);
      Object.assign(to[k], target[k]);
      delay[k] = reduced ? 0 : (to[k].x / W) * 260 + (to[k].y / H) * 180 + Math.random() * 120;
    });
    t0 = now;
  }
  const sentence = (p) => {
    const w = p.words[0];
    return p.words.length === 1 && w.sex === "female" && w.age === "adult" && w.activity === "walk";
  };

  // Instance buffers.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const rectBuf = gl.createBuffer(), uvBuf = gl.createBuffer(), lookBuf = gl.createBuffer();
  const rect = new Float32Array(N * 4), uv = new Float32Array(N * 4), look = new Float32Array(N * 2);
  for (const [buf, loc, size] of [[rectBuf, 1, 4], [uvBuf, 2, 4], [lookBuf, 3, 2]]) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 1);
  }
  // Draw order: by sheet, so each sheet is one call.
  const bySheet = [...Array(meta.sheets)].map(() => []);
  people.forEach((p, k) => bySheet[p.views[p.view][0]].push(k));
  const order = bySheet.flat();
  const firstOf = []; let acc = 0;
  bySheet.forEach((list) => { firstOf.push(acc); acc += list.length; });
  order.forEach((k, slot) => {
    const [, x, y, w, h] = people[k].views[people[k].view];
    uv.set([x / meta.sheet, y / meta.sheet, w / meta.sheet, h / meta.sheet], slot * 4);
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(prog, "uView"), W, H);
    const t = mode === "pyramid" ? layoutPyramid() : mode === "sentence" ? layoutSentence(sentence) : layoutGrid();
    t.forEach((v, k) => { Object.assign(cur[k], v); Object.assign(to[k], v); Object.assign(from[k], v); });
    if (filter) arrange();
  }

  let hover = -1;
  function frame(now) {
    for (let slot = 0; slot < N; slot++) {
      const k = order[slot];
      const p = people[k];
      const t = outCubic(Math.max(0, Math.min(1, (now - t0 - delay[k]) / dur)));
      const c = cur[k], f = from[k], g = to[k];
      c.x = f.x + (g.x - f.x) * t; c.y = f.y + (g.y - f.y) * t; c.s = f.s + (g.s - f.s) * t; c.a = f.a + (g.a - f.a) * t;
      const [, , , w, h, ground] = p.views[p.view];
      // Everyone at one scale: the tile's own height in metres, the cell's height for a 2.0 m frame.
      const pxm = c.s / 2.0, m = pxm / meta.px_per_m;
      const lift = k === hover ? 1.35 : 1;
      rect.set([c.x, c.y + (h - ground) * m * lift, w * m * lift, h * m * lift], slot * 4);
      look.set([c.a, 0], slot * 2);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, rectBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rect, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, lookBuf);
    gl.bufferData(gl.ARRAY_BUFFER, look, gl.DYNAMIC_DRAW);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bySheet.forEach((list, s) => {
      if (!list.length) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sheets[s]);
      // Instances of this sheet: offset the instance attributes to its first slot.
      for (const [buf, loc, size] of [[rectBuf, 1, 4], [uvBuf, 2, 4], [lookBuf, 3, 2]]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, firstOf[s] * size * 4);
      }
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, list.length);
    });
    requestAnimationFrame(frame);
  }

  // Pointing at someone: their words.
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 1e9;
    for (let k = 0; k < N; k++) {
      const c = cur[k];
      if (c.a < 0.5) continue;
      const dx = x - c.x, dy = y - (c.y - c.s * 0.4);
      const d = dx * dx + dy * dy * 0.5;
      if (d < bd && Math.abs(dx) < c.s * 0.35 && Math.abs(dy) < c.s * 0.6) { bd = d; best = k; }
    }
    hover = best;
    if (best < 0) { card.classList.remove("is-on"); return; }
    card.innerHTML = people[best].words.map((w) => words(w)).join("<hr>");
    card.style.transform = `translate(${Math.min(x + 18, r.width - 280)}px, ${Math.max(0, y - 140)}px)`;
    card.classList.add("is-on");
  });
  canvas.addEventListener("pointerleave", () => { hover = -1; card.classList.remove("is-on"); });

  root.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter === "all" ? null : b.dataset.filter;
    root.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (mode === "sentence") mode = "grid";
    root.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === mode)));
    arrange();
  }));
  root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    root.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    arrange();
  }));

  new ResizeObserver(resize).observe(canvas);
  resize();
  // Arriving: everyone falls into place from above, row by row, when the wall first comes into view.
  if (!reduced) {
    cur.forEach((c, k) => {
      const above = { x: c.x, y: -c.s * (0.3 + Math.random() * 1.2), s: c.s, a: 0 };
      Object.assign(c, above); Object.assign(from[k], above); Object.assign(to[k], above);
    });
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      dur = 1300;
      arrange();
      setTimeout(() => { dur = 900; }, 2600);
    }, { threshold: 0.25 });
    seen.observe(canvas);
  }
  requestAnimationFrame(frame);
}
