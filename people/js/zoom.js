// Scene 6: from 80 metres to arm's length. A frame as the capture drone's camera takes it; scrolling closes in on
// one person until their pixels show, then the pixels give way to the same person rendered close, turning.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const io3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function initZoom(root, { reduced }) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const meta = await (await fetch("assets/zoom/zoom.json")).json();
  const track = root.querySelector("[data-zoom-track]");
  const stage = root.querySelector("[data-zoom-stage]");
  const frameEl = root.querySelector("[data-zoom-frame]");
  const img = root.querySelector("[data-zoom-img]");
  const bracket = root.querySelector("[data-zoom-bracket]");
  const close = root.querySelector("[data-zoom-close]");
  const text = root.querySelector("[data-zoom-text]");
  const hud = root.querySelector("[data-zoom-hud]");
  img.src = "assets/zoom/frame.webp";
  track.style.height = "320vh";
  const turn = new Image();
  turn.src = "assets/zoom/turn.webp";
  const g = close.getContext("2d");
  const [W, H] = meta.size;
  const [x0, y0, x1, y1] = meta.box;            // the person, in the frame's pixels
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const zMax = (H * 0.62) / (y1 - y0);          // the person 62% of the stage's height

  function frame(now) {
    const r = track.getBoundingClientRect();
    const span = Math.max(1, track.offsetHeight - window.innerHeight);
    const p = reduced ? 1 : clamp01(-r.top / span);
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const base = Math.max(sw / W, sh / H);      // cover
    const zt = io3(clamp01(p / 0.62));
    const z = Math.exp(Math.log(1) * (1 - zt) + Math.log(zMax) * zt);
    const s = base * z;
    // Keep the person where the camera ends on them: the middle of the stage.
    const tx = sw / 2 - (cx * s) * zt - (W * s / 2) * (1 - zt);
    const ty = sh / 2 - (cy * s) * zt - (H * s / 2) * (1 - zt);
    frameEl.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    frameEl.style.width = `${W}px`;
    frameEl.style.height = `${H}px`;
    img.style.imageRendering = z > 6 ? "pixelated" : "auto";
    bracket.style.transform = `translate(${x0 * s + tx - 6}px, ${y0 * s + ty - 6}px)`;
    bracket.style.width = `${(x1 - x0) * s + 12}px`;
    bracket.style.height = `${(y1 - y0) * s + 12}px`;
    bracket.style.opacity = String(clamp01((p - 0.08) / 0.1) * (1 - clamp01((p - 0.7) / 0.1)));
    const px = Math.round(y1 - y0);
    hud.textContent = p < 0.62 ? `80 m · 57.4° · ${W} × ${H}` : `this person: ${Math.round(x1 - x0)} × ${px} px`;
    // The close render takes over after the pixels have been seen.
    const handover = clamp01((p - 0.7) / 0.16);
    close.style.opacity = String(handover);
    frameEl.style.opacity = String(1 - handover * 0.85);
    text.classList.toggle("is-a", p > 0.45 && p < 0.72);
    text.classList.toggle("is-b", p >= 0.78);
    if (handover > 0 && turn.complete && turn.naturalWidth) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (close.width !== Math.round(sw * dpr)) { close.width = Math.round(sw * dpr); close.height = Math.round(sh * dpr); }
      const [fw, fh] = meta.turn_frame;
      const k = Math.floor((now / 110) % 24);
      const hh = close.height * 0.86, ww = hh * fw / fh;
      g.clearRect(0, 0, close.width, close.height);
      g.drawImage(turn, (k % 6) * fw, Math.floor(k / 6) * fh, fw, fh, (close.width - ww) / 2, close.height * 0.07, ww, hh);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
