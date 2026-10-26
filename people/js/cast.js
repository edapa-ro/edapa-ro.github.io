// Scene 7: a new cast every frame. A curtain between the crowd as it was and a written cast on the same places, and
// one place through every cast, playing by itself.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export async function initCast(root, { reduced, words }) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const meta = await (await fetch("assets/flip/flip.json")).json();
  const curtain = root.querySelector("[data-curtain]");
  const after = root.querySelector("[data-curtain-after]");
  const line = root.querySelector("[data-curtain-line]");
  root.querySelector("[data-curtain-before]").src = "assets/before/crowd.webp";
  after.src = `assets/casts/${meta.curtain || "test_a"}/crowd.webp`;

  let at = 0.5;
  const set = (v) => {
    at = clamp(v, 0.02, 0.98);
    after.style.clipPath = `inset(0 0 0 ${at * 100}%)`;
    line.style.left = `${at * 100}%`;
    line.setAttribute("aria-valuenow", String(Math.round(at * 100)));
  };
  set(0.5);
  let dragging = false;
  const move = (e) => {
    if (!dragging) return;
    const r = curtain.getBoundingClientRect();
    set((e.clientX - r.left) / r.width);
  };
  curtain.addEventListener("pointerdown", (e) => { dragging = true; curtain.setPointerCapture(e.pointerId); move(e); });
  curtain.addEventListener("pointermove", move);
  curtain.addEventListener("pointerup", () => { dragging = false; });
  line.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") set(at - 0.05);
    if (e.key === "ArrowRight") set(at + 0.05);
  });

  // The flipbook: one place, every cast.
  const row = root.querySelector("[data-flip-row]");
  const range = root.querySelector("[data-flip-range]");
  const nEl = root.querySelector("[data-flip-n]");
  const play = root.querySelector("[data-flip-play]");
  row.innerHTML = meta.frames.map((f, i) => `<figure class="p-flip__cell${i === 0 ? " is-on" : ""}">
      <img src="assets/flip/${f.file}" alt="" loading="lazy"><figcaption>${words(f.words[0] || {})}</figcaption></figure>`).join("");
  const cells = [...row.children];
  range.max = String(meta.frames.length - 1);
  let k = 0, playing = !reduced, timer = null;
  const show = (i) => {
    k = (i + meta.frames.length) % meta.frames.length;
    cells.forEach((c, j) => c.classList.toggle("is-on", j === k));
    range.value = String(k);
    nEl.textContent = `cast ${k + 1} of ${meta.frames.length}`;
  };
  const tick = () => { show(k + 1); timer = setTimeout(tick, 1400); };
  range.addEventListener("input", () => { show(Number(range.value)); });
  play.addEventListener("click", () => {
    playing = !playing;
    play.textContent = playing ? "pause" : "play";
    play.setAttribute("aria-pressed", String(playing));
    clearTimeout(timer);
    if (playing) timer = setTimeout(tick, 900);
  });
  show(0);
  if (playing) timer = setTimeout(tick, 1400);
  else play.textContent = "play";
}
