// Scene 10: the machine. A sentence travels through the eight stages as the section scrolls past, each stage lighting
// up as it arrives; at the end it has become a person with a box round them.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function initMachine(root, { reduced }) {
  if (root.dataset.started) return;
  root.dataset.started = "1";
  const list = root.querySelector(".p-machine__nodes");
  const nodes = [...list.children];
  const chip = document.createElement("span");
  chip.className = "chip is-new p-machine__chip";
  chip.textContent = "a woman · navy sweater · headscarf · walking";
  list.appendChild(chip);
  // What the sentence has become at each stage: words only, no internal names.
  const words = ["a woman · navy sweater · headscarf · walking", "+ a market · temperate · autumn",
    "drawn: every field, by weight and rule", "pieces: a body, legs, a head, a hijab, a backpack",
    "built: body → clothes → head → pose → hands", "checked: on the ground, alone, inside nothing",
    "placed where the plan says", "a box, a mask, and this sentence"];
  let last = -1;

  function frame() {
    const r = list.getBoundingClientRect();
    const t = reduced ? 1 : clamp01((window.innerHeight * 0.75 - r.top) / (r.height + window.innerHeight * 0.35));
    const pos = t * (nodes.length - 1);
    const k = Math.floor(pos), f = pos - k;
    const a = nodes[k].getBoundingClientRect(), b = nodes[Math.min(nodes.length - 1, k + 1)].getBoundingClientRect();
    const x = a.left + (b.left - a.left) * f - r.left + 18, y = a.top + (b.top - a.top) * f - r.top - 16;
    chip.style.transform = `translate(${x}px, ${y}px)`;
    const on = Math.round(pos);
    nodes.forEach((n, i) => n.classList.toggle("is-lit", i <= on));
    if (on !== last) { chip.textContent = words[on]; last = on; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
