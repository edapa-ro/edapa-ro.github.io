// The live failure map: one off-the-shelf detector's share of people found, by apparent
// height and how much of each person is hidden, on each place and on real footage. The
// numbers are the published slice reports, gathered into assets/data/failure-map.json by
// site/tools/build_failure_map.py; nothing here computes a result.

const NF = new Intl.NumberFormat("en-US");
const pct = (v) => {
  const p = v * 100;
  return (p < 10 ? p.toFixed(1) : String(Math.round(p))) + "%";
};
const range = (c) => `${pct(c.lo)}–${pct(c.hi)}`;

const NOTES = {
  quarry: "On the quarry, small people in plain view are found far less often than on the other places or on real footage. The cause is not yet known; result A above says more.",
  real: "Real footage is VisDrone-DET-val. How much of a person is hidden is the annotators’ judgement there, in the same three levels; the cells for mostly hidden people rest on few people.",
};

export function initFailureMap() {
  const root = document.querySelector("[data-fmap]");
  if (!root) return;
  const tabs = root.querySelector("[data-fmap-tabs]");
  const host = root.querySelector("[data-fmap-grid]");
  const detail = root.querySelector("[data-fmap-detail]");
  const note = root.querySelector("[data-fmap-note]");
  let data = null, sources = [], cells = [], current = 0;

  const thin = (c) => c.n < data.thin;
  const sentence = (s, i, j) => {
    const c = s.cells[i][j], lv = data.levels[i];
    let t = `${s.name}, people ${data.sizes[j]} px tall, ${lv.label.toLowerCase()} (${lv.range}): ` +
      `${pct(c.r)} found, 95% interval ${range(c)}, out of ${NF.format(c.n)}${thin(c) ? ", too few to lean on" : ""}.`;
    if (s.key !== "real") {
      const rc = data.real.cells[i][j];
      t += ` Real footage, same cell: ${pct(rc.r)} (${range(rc)}), out of ${NF.format(rc.n)}${thin(rc) ? ", too few to lean on" : ""}.`;
    }
    return t;
  };
  const hint = (s) => s.key === "real"
    ? `${s.name}: ${NF.format(s.frames)} frames of ${s.benchmark}. Point at a cell for its interval.`
    : `${s.name}: the whole corpus, ${NF.format(s.frames)} frames. Point at a cell for its interval.`;

  function build() {
    sources = [...data.places, data.real];
    tabs.replaceChildren(...sources.map((s, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.name;
      if (s.key === "real") b.className = "is-real";
      b.addEventListener("click", () => show(k));
      return b;
    }));

    const table = document.createElement("table");
    table.className = "fmap__grid";
    const cap = table.createCaption();
    cap.className = "sr";
    cap.textContent = "Share of people found, by apparent height (columns) and how much of each person is hidden (rows)";
    const head = table.createTHead().insertRow();
    const corner = document.createElement("th");
    corner.scope = "col";
    corner.innerHTML = '<span class="sr">How much is hidden</span>';
    head.appendChild(corner);
    for (const size of data.sizes) {
      const th = document.createElement("th");
      th.scope = "col";
      th.innerHTML = `${size}<small>px tall</small>`;
      head.appendChild(th);
    }
    const body = table.createTBody();
    data.levels.forEach((lv, i) => {
      const row = body.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.innerHTML = `${lv.label}<small>${lv.range}</small>`;
      row.appendChild(th);
      data.sizes.forEach((_, j) => {
        const td = row.insertCell();
        const b = document.createElement("button");
        b.type = "button";
        b.className = "fmap__cell";
        b.dataset.i = i;
        b.dataset.j = j;
        b.innerHTML = "<b></b><small></small><em></em>";
        td.appendChild(b);
        cells.push(b);
      });
    });
    const say = (e) => {
      const b = e.target.closest(".fmap__cell");
      if (b) detail.textContent = sentence(sources[current], +b.dataset.i, +b.dataset.j);
    };
    table.addEventListener("pointerover", say);
    table.addEventListener("focusin", say);
    table.addEventListener("pointerleave", () => { detail.textContent = hint(sources[current]); });
    table.addEventListener("focusout", (e) => {
      if (!table.contains(e.relatedTarget)) detail.textContent = hint(sources[current]);
    });
    host.replaceChildren(table);
    show(0);
  }

  function show(k) {
    current = k;
    const s = sources[k], isReal = s.key === "real";
    [...tabs.children].forEach((b, n) => b.setAttribute("aria-pressed", String(n === k)));
    root.classList.toggle("is-real", isReal);
    for (const b of cells) {
      const i = +b.dataset.i, j = +b.dataset.j;
      const c = s.cells[i][j];
      b.style.setProperty("--r", c.r);
      b.classList.toggle("is-hi", c.r >= 0.55);
      b.classList.toggle("is-thin", thin(c));
      b.querySelector("b").textContent = pct(c.r);
      b.querySelector("small").textContent = thin(c) ? `${NF.format(c.n)} · thin` : NF.format(c.n);
      b.querySelector("em").textContent = isReal ? "" : `real ${pct(data.real.cells[i][j].r)}`;
      b.setAttribute("aria-label", sentence(s, i, j));
    }
    note.textContent = NOTES[s.key] || "";
    note.hidden = !NOTES[s.key];
    detail.textContent = hint(s);
  }

  // the data is small, but there is no reason to fetch it before the block is near
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    fetch("assets/data/failure-map.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { data = d; build(); })
      .catch((err) => console.warn("failure map unavailable:", err));
  }, { rootMargin: "800px 0px" }).observe(root);
}
