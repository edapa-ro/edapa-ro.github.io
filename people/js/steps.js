// Scene 2: how a person is built. Eight pictures of one person, one per step, each the step's own build; scrolling
// carries one into the next. Most steps rise from the feet with a lime edge; the hijab sweeps across, column by
// column, the way it is grown round the face. Over the steps, the sentence she was written from: each step lights the
// words it makes.

import { WHO, nice } from "./words.js";

const VS = `#version 300 es
in vec2 p;
out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uA, uB;
uniform float uT, uSweep;
uniform vec2 uFit;
float hh(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
float nn(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 uv = (vUv - 0.5) / uFit + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { o = vec4(0.0); return; }
  uv.y = 1.0 - uv.y;
  vec4 a = texture(uA, uv), b = texture(uB, uv);
  // Rising: the new picture from the feet (uv.y = 1) up. Sweeping: from the left, in narrow columns.
  float pos = uSweep > 0.5 ? floor(uv.x * 90.0) / 90.0 : 1.0 - uv.y;
  float level = pos + (nn(uv * vec2(30.0, 70.0)) - 0.5) * (uSweep > 0.5 ? 0.0 : 0.05);
  float edge = uT * 1.1 - level;
  vec4 c = edge > 0.0 ? b : a;
  float line = smoothstep(0.012, 0.0, abs(edge)) * step(0.001, uT) * step(uT, 0.999) * max(a.a, b.a);
  vec3 lime = vec3(0.776, 0.949, 0.306);
  o = vec4(mix(c.rgb, lime, line), max(c.a, line));
  o.rgb *= o.a;
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const io3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// The person's sentence as words and the glue between them, each word with the step that makes it: the body brings
// who she is and what she wears on top, the legs (when sewn) the bottom, the colour step the colours, and so on.
const PATTERN = { stripes: "striped", checks: "checked", print: "printed", floral: "floral" };
const BUILD = { slim: "slim", stocky: "stocky", heavy: "heavy-set" };
const NONE = new Set(["none", "na", "plain", "medium", "average", "covered", "", undefined, null]);
function sentence(w, steps) {
  const at = (...kinds) => Math.max(0, ...kinds.map((k) => steps.indexOf(k)));
  const out = [];
  const word = (text, step) => out.push({ text, step });
  const glue = (text) => out.push({ text });
  const a = (next) => (/^[aeiou]/i.test(next) ? "an" : "a");
  const height = NONE.has(w.height) ? "" : nice(w.height);
  const build = BUILD[w.build] || "";
  const who = WHO[`${w.sex}:${w.age}`] || "person";
  const first = height || build || who;
  glue(a(first).replace(/^a/, "A"));
  if (height) word(height, at("body"));
  if (height && build) glue(",");
  if (build) word(build, at("build"));
  word(who, at("body"));
  if (!NONE.has(w.top)) {
    const shade = [w.top_colour, PATTERN[w.top_pattern]].filter((v) => !NONE.has(v)).map(nice).join(" ");
    glue("in " + a(shade || nice(w.top)));
    if (shade) word(shade, at("colour"));
    word(nice(w.top), at("body"));
  }
  if (!NONE.has(w.bottom)) {
    glue("and");
    if (!NONE.has(w.bottom_colour)) word(nice(w.bottom_colour), at("colour"));
    word(nice(w.bottom), at("waist", "body"));
  }
  const extras = [];
  if (!NONE.has(w.headwear)) extras.push([nice(w.headwear), at("hijab", "body")]);
  if (!NONE.has(w.back)) extras.push([nice(w.back), at("backpack")]);
  extras.forEach(([text, step], i) => { glue((i ? "and " : ", ") + a(text)); word(text, step); });
  if (!NONE.has(w.activity)) { glue(","); word(nice(w.activity), at("pose")); }
  const held = [w.both_hands, w.right_hand, w.left_hand].find((v) => !NONE.has(v));
  if (held) { glue("with " + a(nice(held))); word(nice(held), at("hands")); }
  glue(".");
  return out;
}

export async function initSteps(root, { reduced }) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const meta = await (await fetch("assets/steps/steps.json")).json();
  const track = root.querySelector("[data-steps-track]");
  const list = [...root.querySelectorAll("[data-steps-list] li")];
  // Step 2 is the legs sewn from another avatar or another avatar's head, whichever this person was built with.
  const second = list[1];
  if (meta.steps[1] === "waist") {
    second.querySelector("h3").textContent = "Legs";
    second.querySelector("p").textContent = "Another avatar's legs, sewn on 2 cm above the hips, the cut hidden under the waistband.";
  }
  const sentenceEl = root.querySelector("[data-steps-sentence]");
  if (meta.words) {
    sentenceEl.innerHTML = sentence(meta.words, meta.steps)
      .map((t) => (t.step === undefined ? t.text : `<span class="w" data-step="${t.step}">${t.text}</span>`))
      .join(" ").replace(/ ([,.])/g, "$1");
  }
  const wordEls = [...sentenceEl.querySelectorAll("[data-step]")];
  let lit = -1;
  const countEl = root.querySelector("[data-steps-count]");
  const bar = root.querySelector("[data-steps-bar]");
  const canvas = root.querySelector("[data-steps-canvas]");
  bar.innerHTML = meta.steps.map(() => "<i><b></b></i>").join("");
  const bars = [...bar.querySelectorAll("b")];
  track.style.height = `${meta.steps.length * 70 + 60}vh`;

  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true });
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform1i(U("uA"), 0);
  gl.uniform1i(U("uB"), 1);

  const tex = await Promise.all(meta.files.map((f) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      res(t);
    };
    im.onerror = rej;
    im.src = `assets/steps/${f}`;
  })));
  const [iw, ih] = meta.size;

  function frame() {
    gl.useProgram(prog);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Contain the picture in the canvas.
    const ca = w / h, ia = iw / ih;
    gl.uniform2f(U("uFit"), ia > ca ? 1 : ia / ca, ia > ca ? ca / ia : 1);
    const r = track.getBoundingClientRect();
    const span = Math.max(1, track.offsetHeight - window.innerHeight);
    const p = clamp01(-r.top / span) * (meta.steps.length - 0.001);
    const k = Math.floor(p), f = p - k;
    // Each step holds still, then hands over to the next in its last 45%.
    const t = reduced ? 0 : io3(clamp01((f - 0.55) / 0.45));
    const a = k, b = Math.min(meta.steps.length - 1, k + 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[a]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[b]);
    gl.uniform1f(U("uT"), a === b ? 0 : t);
    gl.uniform1f(U("uSweep"), meta.steps[b] === "hijab" ? 1 : 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const shown = t > 0.5 ? b : a;
    list.forEach((li, i) => li.classList.toggle("is-on", i === shown));
    if (shown !== lit) {
      lit = shown;
      wordEls.forEach((el) => {
        const s = Number(el.dataset.step);
        el.classList.toggle("is-done", s < shown);
        el.classList.toggle("is-now", s === shown);
      });
    }
    bars.forEach((el, i) => { el.style.transform = `scaleX(${i < k ? 1 : i === k ? clamp01(f / 0.55) : 0})`; });
    countEl.textContent = `step ${shown + 1} of ${meta.steps.length}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
