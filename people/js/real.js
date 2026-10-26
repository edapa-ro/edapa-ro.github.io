// Scene 2: from a photo to a person. One real person after another as you scroll: the free photo closes in
// on them, the words the photo shows are written as chips, and our reconstruction rises from the feet up
// and turns. Both are then shown at the drone's own pixels.

const VS = `#version 300 es
in vec2 p;
uniform vec4 uRect;   // where the person stands on the canvas, in clip space: x, y, w, h
out vec2 vUv;
void main() { vUv = p; gl_Position = vec4(uRect.xy + p * uRect.zw, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec4 uFrame;   // the turn's rectangle in the sheet, 0..1
uniform float uRise;   // 0: nothing built, 1: the whole person
float hash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 uv = uFrame.xy + vec2(vUv.x, 1.0 - vUv.y) * uFrame.zw;
  vec4 c = texture(uTex, uv);
  float level = vUv.y + (noise(vUv * vec2(28.0, 60.0)) - 0.5) * 0.07;
  float edge = uRise * 1.08 - level;
  if (edge < 0.0) discard;
  vec3 lime = vec3(0.776, 0.949, 0.306);
  float line = smoothstep(0.022, 0.0, edge) * step(uRise, 0.999);
  o = vec4(mix(c.rgb, lime, line * 0.9), c.a);
  o.rgb *= o.a;
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
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("cannot load " + src));
    im.src = src;
  });
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (t) => 1 - Math.pow(1 - t, 3);

export async function initReal(root, { reduced }) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const data = await (await fetch("assets/real/real.json")).json();
  const track = root.querySelector("[data-real-track]");
  const photoIn = root.querySelector("[data-photo-in]");
  const photoImg = root.querySelector("[data-photo]");
  const bracket = root.querySelector("[data-bracket]");
  const credit = root.querySelector("[data-credit]");
  const chipsEl = root.querySelector("[data-chips]");
  const counter = root.querySelector("[data-counter]");
  const labelEl = root.querySelector("[data-label]");
  const droneReal = root.querySelector("[data-drone-real]");
  const droneOurs = root.querySelector("[data-drone-ours]");
  const scaleEl = root.querySelector("[data-scale]");
  const dots = root.querySelector("[data-dots]");
  const canvas = root.querySelector("[data-ours]");
  track.style.height = `${data.length * 90 + 60}vh`;
  dots.innerHTML = data.map(() => "<i></i>").join("");

  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true });
  let prog, U;
  if (gl) {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    U = (n) => gl.getUniformLocation(prog, n);
  }

  // Each photo's turns, loaded when it comes near.
  const sheets = new Map();
  async function sheetsOf(i) {
    if (!gl || i < 0 || i >= data.length) return [];
    if (!sheets.has(i)) {
      sheets.set(i, Promise.all(data[i].people.filter((p) => p.turn).map(async (p) => {
        const im = await loadImage(`assets/real/${data[i].photo}/${p.turn.file}`);
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return { tex: t, frame: p.turn.frame, sheetW: im.width, sheetH: im.height };
      })));
    }
    return sheets.get(i);
  }

  let shown = -1, people = [], chipNodes = [], born = 0;
  async function show(i) {
    shown = i;
    const d = data[i];
    counter.textContent = `${String(i + 1).padStart(2, "0")} / ${String(data.length).padStart(2, "0")}`;
    [...dots.children].forEach((el, k) => el.classList.toggle("is-on", k === i));
    photoImg.src = `assets/real/${d.photo}/photo.webp`;
    credit.innerHTML = `Photo: <a href="${d.credit.url}" rel="noopener">${d.credit.author}</a> · ${d.credit.licence} · Wikimedia Commons`;
    labelEl.textContent = d.people.map((p) => p.label).filter((v, k, a) => a.indexOf(v) === k).join(" · ");
    droneReal.src = `assets/real/${d.photo}/drone_real.webp`;
    droneOurs.src = `assets/real/${d.photo}/drone_ours.webp`;
    scaleEl.textContent = `${d.drone_px} px tall, both`;
    chipsEl.textContent = "";
    chipNodes = [];
    d.people.forEach((p, k) => {
      if (d.people.length > 1) {
        const who = document.createElement("p");
        who.className = "p-real__who";
        who.textContent = p.label;
        chipsEl.appendChild(who);
      }
      for (const [f, v] of (d.people.length > 1 ? p.short : p.chips)) {
        const c = document.createElement("span");
        c.className = "chip";
        c.innerHTML = `<span class="k">${f}</span><b></b>`;
        c.dataset.text = v;
        chipsEl.appendChild(c);
        chipNodes.push(c);
      }
    });
    people = await sheetsOf(i);
    sheetsOf(i + 1);
    born = performance.now();
  }

  function typeChip(c) {
    if (c.dataset.typed) return;
    c.dataset.typed = "1";
    c.classList.add("is-in", "is-new");
    const b = c.querySelector("b"), text = c.dataset.text;
    let n = 0;
    const step = () => { b.textContent = text.slice(0, ++n); if (n < text.length) setTimeout(step, 18); else setTimeout(() => c.classList.remove("is-new"), 500); };
    step();
  }

  function zoomPhoto(t) {
    const d = data[shown];
    const [x0, y0, x1, y1] = d.person;
    const z = 1 + ease(clamp01(t / 0.3)) * Math.min(2.6, 0.55 / Math.max(0.01, y1 - y0) - 1);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const k = ease(clamp01(t / 0.3));
    photoIn.style.transform = `scale(${z}) translate(${(0.5 - cx) * 100 * k}%, ${(0.5 - cy) * 100 * k}%)`;
    // The bracket sits on the person in the zoomed picture.
    const W = photoIn.clientWidth, H = photoIn.clientHeight;
    const bx = (x0 - 0.5 + (0.5 - cx) * k) * z * W + W / 2, by = (y0 - 0.5 + (0.5 - cy) * k) * z * H + H / 2;
    bracket.style.transform = `translate(${bx - 8}px, ${by - 8}px)`;
    bracket.style.width = `${(x1 - x0) * z * W + 16}px`;
    bracket.style.height = `${(y1 - y0) * z * H + 16}px`;
    bracket.classList.toggle("is-on", t > 0.22);
  }

  function draw(rise, now) {
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!people.length) return;
    const turn = rise >= 1 ? Math.floor(((now - born) / 110) % 24) : 0;
    // Side by side, all at one height: as tall as the panel, or less if together they would not fit across.
    const widths = people.map((s) => (s.frame[0] / s.frame[1]) * (h / w));
    const total = widths.reduce((a, b) => a + b, 0) * 0.82;
    const hClip = Math.min(1.9, 1.94 / total);
    let x = -(total * hClip) / 2;
    people.forEach((s, k) => {
      const [fw, fh] = s.frame;
      const wClip = widths[k] * hClip;
      // Each turn's frame is as wide as its widest turn; neighbours overlap by that empty margin.
      gl.uniform4f(U("uRect"), x - wClip * 0.09, -0.95, wClip, hClip);
      x += wClip * 0.82;
      const col = turn % 6, row = Math.floor(turn / 6);
      gl.uniform4f(U("uFrame"), (col * fw) / s.sheetW, (row * fh) / s.sheetH, fw / s.sheetW, fh / s.sheetH);
      gl.uniform1f(U("uRise"), rise);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.uniform1i(U("uTex"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
  }

  let lastRise = 0;
  function frame(now) {
    const r = track.getBoundingClientRect();
    const span = track.offsetHeight - window.innerHeight;
    const p = clamp01(-r.top / Math.max(1, span)) * data.length;
    const i = Math.min(data.length - 1, Math.floor(p));
    const t = reduced ? 1 : p - i;
    if (i !== shown) show(i);
    if (shown >= 0) {
      zoomPhoto(t);
      const want = Math.ceil(chipNodes.length * clamp01((t - 0.22) / 0.3));
      chipNodes.forEach((c, k) => { if (k < want) typeChip(c); });
      const rise = reduced ? 1 : ease(clamp01((t - 0.48) / 0.24));
      if (rise >= 1 && lastRise < 1) born = now;
      lastRise = rise;
      draw(rise, now);
      root.classList.toggle("is-scaled", t > 0.62 || reduced);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
