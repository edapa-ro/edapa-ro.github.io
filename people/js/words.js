// A person's words in English, for the cards that open over them.

const WHO = {
  "female:toddler": "toddler", "male:toddler": "toddler", "female:child": "girl", "male:child": "boy",
  "female:teen": "teenage girl", "male:teen": "teenage boy", "female:adult": "woman", "male:adult": "man",
  "female:elderly": "older woman", "male:elderly": "older man",
};
const NICE = {
  tshirt: "t-shirt", tank_top: "tank top", blouse_polo: "polo", long_robe: "long robe", bare_chest: "bare chest",
  hard_hat: "hard hat", hi_vis: "hi-vis vest", sun_hat: "sun hat", load_on_head: "load on the head",
  conical_hat: "conical hat", bike_helmet: "bike helmet", moto_helmet: "helmet", dark_grey: "dark grey",
  light_grey: "light grey", light_blue: "light blue", light_denim: "light denim", flip_flops: "flip-flops",
  long_loose: "long, loose", long_tied: "long, tied", afro_volume: "afro", braids_locs: "braids",
  dark_brown: "dark brown", small_backpack: "small backpack", child_in_arms: "a child in the arms",
  dog_on_leash: "a dog on a leash", kick_scooter: "kick scooter", tuktuk_rickshaw: "rickshaw",
  look_bend: "bending down", eat_drink: "eating", walk: "walking", stand: "standing", talk: "talking",
  phone: "on the phone", carry: "carrying", run: "running", photo: "taking a photo", wait: "waiting",
  cross: "crossing", shop: "shopping", play: "playing", work: "working", sell: "selling", ride: "riding",
  sit: "sitting", lie: "lying down", swim: "swimming",
};
const nice = (v) => NICE[v] || String(v).replace(/_/g, " ");

const EMPTY = new Set(["none", "na", "plain", "no", "average", "medium", "covered", "", undefined, null]);

export function cardWords(raw) {
  // Only what the person has: "none", "plain" and the like say nothing on a card.
  const w = Object.fromEntries(Object.entries(raw || {}).filter(([, v]) => !EMPTY.has(v)));
  const rows = [];
  rows.push(`<b>${WHO[`${w.sex}:${w.age}`] || "person"}</b>${w.build && w.build !== "average" ? " · " + nice(w.build) : ""}`);
  const top = [w.top_colour, w.top_pattern, w.top].filter((v) => v && v !== "na").map(nice).join(" ");
  if (top) rows.push(`<span class="k">wears</span> ${top}${w.layer ? ", " + nice(w.layer) : ""}`);
  const bottom = [w.bottom_colour, w.bottom].filter((v) => v && v !== "na" && w.bottom !== "covered").map(nice).join(" ");
  if (bottom) rows.push(`<span class="k">and</span> ${bottom}${w.shoes ? ", " + nice(w.shoes) : ""}`);
  const head = [w.headwear, w.eyewear].filter(Boolean).map(nice).join(", ");
  if (head) rows.push(`<span class="k">head</span> ${head}`);
  rows.push(`<span class="k">doing</span> ${nice(w.activity || "stand")}`);
  const held = [w.right_hand, w.both_hands, w.animal, w.back, w.vehicle].filter(Boolean).map(nice).join(", ");
  if (held) rows.push(`<span class="k">with</span> ${held}`);
  return rows.join("<br>");
}
