// Scene 6: the labels know the words. A piece of a cast: each person's mask fills from the feet up in its own
// colour, its box draws itself from two corners, and pointing at a person opens the sentence that wrote them.

const COLOURS = ["#c6f24e", "#b69cff", "#ff6b35", "#7fd1cc", "#ffd666", "#f080aa", "#78beff", "#aae68c", "#ffa06e",
                 "#c8aaff", "#6edcc8", "#fac85a"];

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

export async function initLabels(root, { reduced, words }) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const meta = await (await fetch("assets/labels/labels.json")).json();
  const [frame, masks] = await Promise.all([loadImage("assets/labels/frame.webp"), loadImage("assets/labels/masks.png")]);
  const canvas = root.querySelector("[data-labels-canvas]");
  const svg = root.querySelector("[data-labels-boxes]");
  const card = root.querySelector("[data-labels-card]");
  const [W, H] = meta.size;
  canvas.width = W; canvas.height = H;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const g = canvas.getContext("2d");
  // The masks as numbers: one byte a pixel, read once.
  const tmp = document.createElement("canvas");
  tmp.width = W; tmp.height = H;
  const tg = tmp.getContext("2d");
  tg.drawImage(masks, 0, 0);
  const ids = tg.getImageData(0, 0, W, H).data;
  const rgb = COLOURS.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  const people = meta.people.map((p, k) => ({ ...p, k: k + 1, col: COLOURS[k % COLOURS.length],
    y0: p.box[1] * H, y1: p.box[3] * H, start: k * 140 + 200 }));

  // Boxes: two strokes each, from the top-left and the bottom-right corners, drawn with their dash.
  svg.innerHTML = people.map((p) => {
    const [x0, y0, x1, y1] = [p.box[0] * W, p.box[1] * H, p.box[2] * W, p.box[3] * H];
    const w = x1 - x0, h = y1 - y0, half = w + h;
    return `<g data-k="${p.k}"><path d="M${x0} ${y1} V${y0} H${x1}" style="stroke-dasharray:${half};stroke-dashoffset:${half};--d:${p.start + 500}ms"/>` +
      `<path d="M${x1} ${y0} V${y1} H${x0}" style="stroke-dasharray:${half};stroke-dashoffset:${half};--d:${p.start + 500}ms"/></g>`;
  }).join("");

  let t0 = null;
  const img = g.createImageData(W, H);
  function paint(now) {
    g.drawImage(frame, 0, 0);
    const base = g.getImageData(0, 0, W, H);
    const d = base.data, o = img.data;
    const t = reduced ? 1e9 : now - t0;
    // Each mask's fill line climbs from the person's feet to the head in 700 ms, after its turn.
    const level = people.map((p) => p.y1 - Math.max(0, Math.min(1, (t - p.start) / 700)) * (p.y1 - p.y0 + 2));
    for (let i = 0, px = 0; i < d.length; i += 4, px++) {
      const k = ids[i];
      if (k && px / W >= level[k - 1]) {
        const c = rgb[(k - 1) % rgb.length];
        o[i] = d[i] * 0.35 + c[0] * 0.65; o[i + 1] = d[i + 1] * 0.35 + c[1] * 0.65; o[i + 2] = d[i + 2] * 0.35 + c[2] * 0.65;
      } else { o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; }
      o[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (t < people.length * 140 + 1200) requestAnimationFrame(paint);
  }

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    t0 = performance.now();
    root.classList.add("is-drawn");
    requestAnimationFrame(paint);
  }, { threshold: 0.35 });
  io.observe(canvas);
  g.drawImage(frame, 0, 0);

  // Pointing at a person: their box lights and their words open beside it.
  const stage = canvas.parentElement;
  stage.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const hit = people.find((p) => x >= p.box[0] * W - 6 && x <= p.box[2] * W + 6 && y >= p.box[1] * H - 6 && y <= p.box[3] * H + 6);
    svg.querySelectorAll("g").forEach((el) => el.classList.toggle("is-on", hit && el.dataset.k === String(hit.k)));
    if (!hit) { card.classList.remove("is-on"); return; }
    card.innerHTML = hit.words.map((w) => words(w)).join("<hr>");
    const left = (hit.box[2] * r.width) + 14, top = hit.box[1] * r.height;
    card.style.transform = `translate(${Math.min(left, r.width - 270)}px, ${Math.max(0, top - 20)}px)`;
    card.classList.add("is-on");
  });
  stage.addEventListener("pointerleave", () => card.classList.remove("is-on"));
}
