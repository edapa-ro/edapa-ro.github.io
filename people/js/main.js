import { initHero } from "./hero.js";
import { initReal } from "./real.js";
import { initWall } from "./wall.js";
import { cardWords } from "./words.js";

const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ready = () => root.classList.add("is-ready");

document.querySelectorAll(".p-hero__title .line > span").forEach((el, i) => el.style.setProperty("--i", i));

// ---------------------------------------------------------------- 0–1: the opening
const hero = document.querySelector("[data-hero]");
initHero(hero, { reduced, onReady: ready }).catch((err) => {
  // No WebGL2 (or a failed load): the still crowd and the copy carry the page.
  console.warn("crowd unavailable:", err);
  root.classList.add("gl-off");
  ready();
});
setTimeout(ready, reduced ? 0 : 5000);

// ---------------------------------------------------------------- 03: the wall, loaded when it comes near
const wall = document.querySelector("[data-wall]");
const wallIo = new IntersectionObserver((entries) => {
  if (!entries.some((e) => e.isIntersecting)) return;
  wallIo.disconnect();
  initWall(wall, { reduced, words: cardWords }).catch((err) => console.warn("wall unavailable:", err));
}, { rootMargin: "600px 0px" });
wallIo.observe(wall);

// ---------------------------------------------------------------- 02, 04, 05, 06: each loaded when it comes near
function whenNear(sel, load) {
  const el = document.querySelector(sel);
  if (!el) return;
  const near = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    near.disconnect();
    load(el).catch((err) => console.warn(sel, "unavailable:", err));
  }, { rootMargin: "800px 0px" });
  near.observe(el);
}
whenNear("[data-real]", (el) => initReal(el, { reduced }));
whenNear("[data-steps]", (el) => import("./steps.js").then((m) => m.initSteps(el, { reduced })));
whenNear("[data-cast]", (el) => import("./cast.js").then((m) => m.initCast(el)));
whenNear("[data-labels]", (el) => import("./labels.js").then((m) => m.initLabels(el, { reduced, words: cardWords })));
// The checks under the steps: each a before and an after picture.
document.querySelectorAll("[data-check]").forEach((f) => {
  f.querySelector("[data-before]").src = `assets/checks/${f.dataset.check}_before.webp`;
  f.querySelector("[data-after]").src = `assets/checks/${f.dataset.check}_after.webp`;
});

// ---------------------------------------------------------------- 08: the photos' credits, from the real people's file
fetch("assets/real/real.json").then((r) => r.json()).then((data) => {
  document.querySelector("[data-photo-credits]").innerHTML = "<p>Wikimedia Commons, each with its author and licence:</p>" +
    data.map((d) => `<p><a href="${d.credit.url}" rel="noopener">${d.credit.author}</a> · ${d.credit.licence}</p>`).join("");
}).catch(() => {});

// ---------------------------------------------------------------- 08: every CC BY model, listed when opened
const modelCredits = document.querySelector("[data-model-credits]");
if (modelCredits) {
  fetch("assets/credits.json").then((r) => r.json()).then((rows) => {
    modelCredits.querySelector("[data-model-count]").textContent = `(${rows.length})`;
    modelCredits.addEventListener("toggle", () => {
      const ul = modelCredits.querySelector("[data-model-list]");
      if (!modelCredits.open || ul.childElementCount) return;
      const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
      ul.innerHTML = rows.map((r) => `<li><span class="k">${esc(r.kind)}</span> ${r.link ? `<a href="${esc(r.link)}" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}${r.author ? " by " + esc(r.author) : ""} · ${esc(r.licence)}</li>`).join("");
    });
  }).catch(() => {});
}

// ---------------------------------------------------------------- masthead
const mast = document.querySelector("[data-mast]");
const onScroll = () => mast.classList.toggle("is-solid", window.scrollY > hero.offsetHeight - 80);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------------------------------------------------------------- counters: once, when they arrive
const fmt = new Intl.NumberFormat("en-US");
function countUp(el) {
  const to = Number(el.dataset.count);
  if (!to || reduced || to < 10) { el.textContent = fmt.format(to); return; }
  const t0 = performance.now(), dur = 1600;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    el.textContent = fmt.format(Math.round(to * (1 - Math.pow(2, -10 * t))));
    if (t < 1) requestAnimationFrame(step); else el.textContent = fmt.format(to);
  };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.querySelectorAll("[data-count]").forEach(countUp);
    io.unobserve(e.target);
  }
}, { rootMargin: "0px 0px -10% 0px" });
document.querySelectorAll(".p-hero__figs").forEach((el) => io.observe(el));

// ---------------------------------------------------------------- cursor: the main page's detection box, locking onto what you can press
if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reduced) {
  const c = document.createElement("div");
  c.className = "cursor is-hidden";
  c.setAttribute("aria-hidden", "true");
  c.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.appendChild(c);
  let x = -100, y = -100, tx = -100, ty = -100, w = 34, h = 34, tw = 34, th = 34, raf = 0, lock = null;
  const tick = () => {
    x += (tx - x) * 0.28; y += (ty - y) * 0.28; w += (tw - w) * 0.25; h += (th - h) * 0.25;
    c.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    c.style.width = w + "px"; c.style.height = h + "px";
    c.style.margin = `${-h / 2}px 0 0 ${-w / 2}px`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tw - w) + Math.abs(th - h) > 0.3 ? requestAnimationFrame(tick) : 0;
  };
  const go = () => { if (!raf) raf = requestAnimationFrame(tick); };
  window.addEventListener("pointermove", (e) => {
    // Over the pictures that answer the pointer themselves (the opening, the wall, the labels, the curtain), no box.
    const own = e.target.closest("[data-gl], .p-hero__tags, [data-wall-canvas], [data-labels-canvas], [data-curtain]");
    c.classList.toggle("is-hidden", Boolean(own));
    const t = e.target.closest("a, button");
    if (t) {
      const r = t.getBoundingClientRect();
      tx = r.left + r.width / 2; ty = r.top + r.height / 2; tw = r.width + 14; th = r.height + 12;
      if (lock !== t) { lock = t; c.classList.add("is-lock"); }
    } else {
      tx = e.clientX; ty = e.clientY; tw = 34; th = 34;
      if (lock) { lock = null; c.classList.remove("is-lock"); }
    }
    go();
  }, { passive: true });
  document.addEventListener("pointerleave", () => c.classList.add("is-hidden"));
  window.addEventListener("scroll", () => { if (lock) { const r = lock.getBoundingClientRect(); tx = r.left + r.width / 2; ty = r.top + r.height / 2; go(); } }, { passive: true });
}

// ---------------------------------------------------------------- arrivals
const arrive = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("is-in");
    arrive.unobserve(e.target);
  }
}, { rootMargin: "0px 0px -12% 0px" });
document.querySelectorAll("main .sect__head, .p-lead, .p-goals__list > div").forEach((el) => arrive.observe(el));
