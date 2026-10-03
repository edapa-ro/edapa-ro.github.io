import { initStage } from "./stage.js";
import { initSections } from "./sections.js";
import { initFailureMap } from "./failuremap.js";

const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ready = () => root.classList.add("is-ready");

// Headline lines arrive one after another.
document.querySelectorAll(".hero__title .line > span").forEach((el, i) => el.style.setProperty("--i", i));

// ---------------------------------------------------------------- hero
const hero = document.querySelector("[data-hero]");
initStage(hero, { reduced, onReady: ready }).catch((err) => {
  // No WebGL2 (or a failed load): the still frame and the copy carry the page.
  console.warn("truth lens unavailable:", err);
  root.classList.add("gl-off");
  hero.querySelector(".hero__controls").hidden = true;
  hero.querySelector(".scenes").hidden = true;
  ready();
});
// Never leave the copy invisible if something upstream stalls.
setTimeout(ready, reduced ? 0 : 6500);

initSections({ reduced });
initFailureMap();

// ---------------------------------------------------------------- masthead
const mast = document.querySelector("[data-mast]");
const onScroll = () => mast.classList.toggle("is-solid", window.scrollY > hero.offsetHeight - 80);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------------------------------------------------------------- reveals and counters
const fmt = new Intl.NumberFormat("en-US");
function countUp(el) {
  const to = Number(el.dataset.count);
  if (!to || reduced || to < 10) { el.textContent = fmt.format(to); return; }
  const t0 = performance.now(), dur = 1500;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(2, -10 * t);
    el.textContent = fmt.format(Math.round(to * (t === 1 ? 1 : e)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("is-in");
    e.target.querySelectorAll("[data-count]").forEach(countUp);
    io.unobserve(e.target);
  }
}, { rootMargin: "0px 0px -12% 0px" });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ---------------------------------------------------------------- cursor: a detection box that locks onto what you can press
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
    const overStage = e.target.closest("[data-stage]");
    c.classList.toggle("is-hidden", Boolean(overStage));
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
