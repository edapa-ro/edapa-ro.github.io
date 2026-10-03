// Behaviour of the page below the opening: the layer story, the place cards.

const FRAMES = ["dubrovnik-004170", "cairo-006907", "bologna-010404", "quarry-007165", "farm-011318"];
const LABELS = ["01 · The frame", "02 · Each person", "03 · Two boxes", "04 · Skeleton", "05 · The hidden part", "06 · Distance"];

export function initSections({ reduced }) {
  initStory(reduced);
  initPlaces(reduced);
}

// One crop, six layers. The step in the middle of the screen decides which layer is up;
// a scan line carries the frame from one layer to the next.
function initStory(reduced) {
  const stack = document.querySelector("[data-story-stack]");
  if (!stack) return;
  const imgs = [...stack.querySelectorAll("img")];
  const label = document.querySelector("[data-story-label]");
  const steps = [...document.querySelectorAll(".step")];
  let current = -1;
  const show = (n) => {
    if (n === current) return;
    const forward = n > current;
    current = n;
    imgs.forEach((img, i) => img.classList.toggle("is-shown", i <= n));
    steps.forEach((s, i) => s.classList.toggle("is-active", i === n));
    if (label) label.textContent = LABELS[n];
    if (!reduced && forward && n > 0) {
      stack.classList.remove("is-scanning");
      void stack.offsetWidth;                                 // restart the animation
      stack.classList.add("is-scanning");
    }
  };
  // the layers load lazily; warm them once the story is near
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    imgs.forEach((img) => { img.loading = "eager"; });
    o.disconnect();
  }, { rootMargin: "600px 0px" }).observe(stack);
  // On a phone the figure sticks to the top half, so the step that counts is the one
  // just below it rather than the one in the middle of the screen.
  const narrow = matchMedia("(max-width: 760px)").matches;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) show(Number(e.target.dataset.step));
  }, { rootMargin: narrow ? "-68% 0px -24% 0px" : "-45% 0px -50% 0px" });
  steps.forEach((s) => io.observe(s));
  show(0);
}

// Each card knows where its people are: pointing at it draws their boxes, from the same
// file the opening reads. Clicking it flies the opening to that place.
function initPlaces(reduced) {
  const cards = [...document.querySelectorAll("[data-place]")];
  const metas = new Map();
  const meta = (i) => {
    if (!metas.has(i)) metas.set(i, fetch(`assets/frames/${FRAMES[i]}/meta.json`).then((r) => r.json()));
    return metas.get(i);
  };
  const draw = async (card) => {
    const svg = card.querySelector(".place__boxes");
    if (!svg || svg.childElementCount) return;
    const i = Number(card.dataset.place);
    const m = await meta(i);
    const ns = "http://www.w3.org/2000/svg";
    const cx = 640, cy = 480;
    for (const p of m.people) {
      const [x0, y0, x1, y1] = p.vis_box;
      const a = Math.max(3, Math.min(8, (x1 - x0) / 3, (y1 - y0) / 3)), e = 2;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M${x0 - e} ${y0 - e + a}V${y0 - e}H${x0 - e + a}M${x1 + e - a} ${y0 - e}H${x1 + e}V${y0 - e + a}M${x1 + e} ${y1 + e - a}V${y1 + e}H${x1 + e - a}M${x0 - e + a} ${y1 + e}H${x0 - e}V${y1 + e - a}`);
      if (!reduced) path.style.setProperty("--d", (Math.hypot(p.centroid[0] - cx, p.centroid[1] - cy) / 2600).toFixed(2) + "s");
      svg.appendChild(path);
    }
  };
  for (const card of cards) {
    const btn = card.querySelector("[data-goto]");
    card.addEventListener("pointerenter", () => draw(card), { passive: true });
    btn.addEventListener("focus", () => draw(card));
    btn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("edapa:go", { detail: Number(btn.dataset.goto) }));
      document.getElementById("top").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    });
  }
  // on touch there is no hover: draw the boxes as each card arrives
  if (matchMedia("(hover: none)").matches) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { draw(e.target).then(() => e.target.querySelector(".place__img").classList.add("is-drawn")); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -20% 0px" });
    cards.forEach((c) => io.observe(c));
  }
}
