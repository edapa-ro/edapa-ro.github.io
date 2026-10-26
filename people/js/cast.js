// Scene 5: before and now. A curtain between the crowd as it was and a written cast on the same places.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export async function initCast(root) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const meta = await (await fetch("assets/before/before.json")).json();
  const curtain = root.querySelector("[data-curtain]");
  const after = root.querySelector("[data-curtain-after]");
  const line = root.querySelector("[data-curtain-line]");
  root.querySelector("[data-curtain-before]").src = "assets/before/crowd.webp";
  after.src = `assets/casts/${meta.curtain}/crowd.webp`;

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
}
