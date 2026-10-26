// Scene 3: write a person. A sentence with words to choose; each choice is a person built from those words
// beforehand and loaded when chosen (assets/compose/compose.json, GLB files under ~0.5 MB). The old person
// dissolves from the head down, the new one rises from the feet, a thin lime edge where the cut is.

import * as THREE from "three";
import { GLTFLoader } from "../vendor/three-0.170.0/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "../vendor/three-0.170.0/addons/loaders/DRACOLoader.js";

const LIME = new THREE.Color(0xc6f24e);

// Every material of a person gets a cut: fragments above `uCut` (in metres, with noise) are not drawn.
function cuttable(root, cut) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uCut = cut.level;
        sh.uniforms.uDir = cut.dir;
        sh.uniforms.uLime = { value: LIME };
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
          .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", `#include <common>
varying vec3 vWorld;
uniform float uCut, uDir;
uniform vec3 uLime;
float hh(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
float nn(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }`)
          .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
float level = vWorld.y + (nn(vWorld.xz * 18.0 + vWorld.y * 9.0) - 0.5) * 0.06;
float edge = uDir > 0.0 ? uCut - level : level - uCut;
if (edge < 0.0) discard;`)
          .replace("#include <dithering_fragment>", `#include <dithering_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, uLime, smoothstep(0.018, 0.0, edge) * step(0.001, abs(uCut - 9.0)));`);
      };
      m.needsUpdate = true;
    });
  });
}

export async function initCompose(root, { reduced }) {
  const data = await (await fetch("assets/compose/compose.json")).json();
  const canvas = root.querySelector("[data-compose-canvas]");
  const sentenceEl = root.querySelector("[data-sentence]");
  const menu = root.querySelector("[data-menu]");
  const sizeEl = root.querySelector("[data-size]");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 1.25, 5.4);
  camera.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight(0xb8c4d6, 0x1a1d1a, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(-2.5, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8dcff, 1.6);
  rim.position.set(2.5, 2.5, -3);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const turn = new THREE.Group();
  scene.add(turn);

  const draco = new DRACOLoader().setDecoderPath("vendor/three-0.170.0/addons/libs/draco/gltf/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const cache = new Map();
  const load = (file) => {
    if (!cache.has(file)) cache.set(file, loader.loadAsync(`assets/compose/${file}`));
    return cache.get(file);
  };

  // The sentence: one slot per field of the combos; a menu offers only what a built person has.
  const fields = data.fields;
  let choice = { ...data.people[0].words };
  let current = null, busy = false;

  function matching(want) {
    return data.people.find((p) => fields.every((f) => p.words[f.key] === want[f.key]));
  }
  function options(field) {
    // Every value a built person has; one that cannot keep the other words brings the person nearest to them.
    return [...new Set(data.people.map((p) => p.words[field.key]))];
  }
  function nearest(want, key) {
    // The person with the chosen word who shares the most other words with the sentence.
    const score = (p) => fields.reduce((n, f) => n + (p.words[f.key] === want[f.key]), 0);
    return data.people.filter((p) => p.words[key] === want[key]).sort((a, b) => score(b) - score(a))[0];
  }
  function writeSentence(changed) {
    sentenceEl.innerHTML = data.sentence.replace(/\{(\w+)\}/g, (_, k) => {
      const f = fields.find((x) => x.key === k);
      const label = f.labels[choice[k]] || choice[k];
      return `<button type="button" class="p-slot${(changed || []).includes(k) ? " is-new" : ""}" data-slot="${k}">${label}</button>`;
    }).replace(/\b(A|a) (<button[^>]*>)(?=[aeiouAEIOU])/g, "$1n $2");
    sentenceEl.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", (e) => openMenu(b, e)));
  }
  function openMenu(btn) {
    const f = fields.find((x) => x.key === btn.dataset.slot);
    menu.innerHTML = options(f).map((v) =>
      `<button type="button" data-v="${v}" aria-pressed="${v === choice[f.key]}">${f.labels[v] || v}</button>`).join("");
    const r = btn.getBoundingClientRect(), rr = root.getBoundingClientRect();
    menu.style.transform = `translate(${r.left - rr.left}px, ${r.bottom - rr.top + 8}px)`;
    menu.classList.add("is-on");
    menu.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => {
      menu.classList.remove("is-on");
      const next = { ...choice, [f.key]: b.dataset.v };
      const p = matching(next) || nearest(next, f.key);
      const changed = fields.filter((x) => p.words[x.key] !== choice[x.key]).map((x) => x.key);
      choice = { ...p.words };
      writeSentence(changed);
      swap(p);
    }));
  }
  document.addEventListener("click", (e) => { if (!menu.contains(e.target) && !e.target.closest("[data-slot]")) menu.classList.remove("is-on"); });

  async function swap(p) {
    if (busy) return;
    busy = true;
    sizeEl.textContent = `${(p.bytes / 1e6).toFixed(2)} MB`;
    const gltf = await load(p.file);
    const next = gltf.scene.clone(true);
    next.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); } });
    // One cut per person: what is under it is drawn. Rising, it climbs from the feet; leaving, it sinks from
    // the head; in between it waits far above (9 m), where nothing is cut and no edge is drawn.
    const cut = { level: { value: -0.1 }, dir: { value: 1 } };
    cuttable(next, cut);
    const old = current;
    const height = new THREE.Box3().setFromObject(next).max.y;
    if (old) {
      const top = old.height;
      if (!reduced) await tween(900, (t) => { old.cut.level.value = top + 0.05 - t * (top + 0.2); });
      turn.remove(old.obj);
    }
    turn.add(next);
    if (!reduced) await tween(900, (t) => { cut.level.value = -0.1 + t * (height + 0.2); });
    cut.level.value = 9;
    current = { obj: next, cut, height };
    busy = false;
  }
  function tween(ms, f) {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        f(t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  // Turning: by dragging, and slowly by itself when left alone.
  let drag = null, spin = 0.0025, last = 0;
  canvas.addEventListener("pointerdown", (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (drag !== null) { turn.rotation.y += (e.clientX - drag) * 0.01; drag = e.clientX; last = performance.now(); } });
  canvas.addEventListener("pointerup", () => { drag = null; });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  renderer.setAnimationLoop((now) => {
    if (!reduced && drag === null && now - last > 2500) turn.rotation.y += spin;
    renderer.render(scene, camera);
  });
  writeSentence(null);
  swap(data.people[0]);
}
