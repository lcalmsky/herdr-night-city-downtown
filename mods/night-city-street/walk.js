// Movement on the street, with no drawing in it. Nothing here runs per frame: a walker's path is
// cut into legs (walk from x0 to x1, or stand), each leg is handed to a native `left` transition,
// and the script only wakes when a leg ends. Positions are in the scene's own 1600x200 units.
import { LAYOUT } from "./manifest.js";

export const S = 1.62;
// The scale at the strip's reference height. The street block is a share of the window now, so the
// picture is drawn at `scaleFor(blockH)`: 370px (330 street + 40 ticker) still gives exactly S.
export const REF_STREET_H = 330;
export const TICKER_H = 40;
export const STREET_MIN = 200, STREET_MAX = 400;
export const SCENE_W = 1600, SCENE_H = 200;
export const BLOCK_W = SCENE_W;
export const PER_BLOCK = 16;
export const MAX_BLOCKS = 4;
export const CROWD = 9;
export const SLOW = 0.15;

/** The street block's height, clamped in case a host ignores the layout's min/max. */
export const clampBlockH = (blockH) => Math.max(STREET_MIN, Math.min(STREET_MAX, blockH));
/** px per scene unit for a street block height. */
export const scaleFor = (blockH) => S * (clampBlockH(blockH) - TICKER_H) / REF_STREET_H;
/** The picture's size in px and its top inside the street strip for a street block height. */
export function geomFor(blockH) {
  const height = clampBlockH(blockH);
  const streetH = height - TICKER_H;
  const scale = scaleFor(height);
  const sw = Math.round(SCENE_W * scale), sh = Math.round(SCENE_H * scale);
  return { blockH: height, streetH, scale, sw, sh, top: streetH - sh };
}

// The asking bubble's widest size in pixels: the text clip limit and its padding, with the halo drawn
// outside the sign. walk.js cannot import scene.js (scene.js imports it), so these live here.
export const BUBBLE_TEXT_MAX = 250, BUBBLE_PAD = 22, BUBBLE_HALO = 4;
// The free space kept between two bubbles' haloes before the lower-priority one is dropped.
export const BUBBLE_GAP = 8;
// The camera stops half the widest bubble, plus its halo, short of a held walker.
export const holdMargin = (scale = S) => Math.max(60, Math.ceil((BUBBLE_TEXT_MAX + BUBBLE_PAD) / 2 / scale) + BUBBLE_HALO);
export const HOLD_MARGIN = holdMargin();

/**
 * Which asking bubbles to drop so that none touches another. `boxes` are `{ id, x, w, selected }`
 * with `x` the bubble's centre and `w` its width in strip px, in the street's own order; a bubble
 * closer to the camera centre `centre` outranks one further out, and the selected session's box
 * outranks them all and is never dropped. Two boxes touch when their haloes are less than
 * BUBBLE_GAP apart.
 */
export function bubblesHidden(boxes, centre) {
  const reach = (box) => Math.abs(box.x - centre);
  const ordered = [...boxes].sort((a, b) => Number(Boolean(b.selected)) - Number(Boolean(a.selected)) || reach(a) - reach(b));
  const kept = [], hidden = [];
  for (const box of ordered) {
    const touch = !box.selected && kept.some((other) => Math.abs(other.x - box.x) < (other.w + box.w) / 2 + 2 * BUBBLE_HALO + BUBBLE_GAP);
    if (touch) hidden.push(box.id);
    else kept.push(box);
  }
  return hidden;
}
const PACE = 35, REST_MS = 1500, MOUNT_MS = 80, LATE_MS = 1000;
const PEOPLE = new Map(LAYOUT.people.map((p) => [p.name, p]));

export const rnd = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
export const laneOf = (status) => (status === "idle" || status === "crowd" ? "back" : "front");
const STATUS_ORDER = { idle: 0, working: 1, stalled: 2, done: 3, needs: 4 };

/** The walkers back to front, so an asking walker's marker is drawn over a working one's. */
export function drawOrder(items) {
  const laneRank = (item) => (laneOf(item.status) === "back" ? 0 : 1);
  const statusRank = (item) => STATUS_ORDER[item.status] ?? 1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => laneRank(a.item) - laneRank(b.item) || statusRank(a.item) - statusRank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/** How many blocks of street are drawn: enough for the view, the sessions, and every home still occupied. */
export function blocksFor({ viewW, count, maxHome, scale = S }) {
  return Math.min(MAX_BLOCKS, Math.max(1, Math.ceil(viewW / (BLOCK_W * scale)), Math.ceil(count / PER_BLOCK), maxHome >= 0 ? Math.floor(maxHome / 8) + 1 : 1));
}

/** px per ms, in scene units. */
export function speedOf(who, lane, status) {
  const person = PEOPLE.get(who) ?? LAYOUT.people[0];
  return (person.speed * LAYOUT.lanes[lane].scale * (status === "stalled" ? 0.35 : 1)) / 1000;
}

export function legX(leg, now) {
  if (!leg.walk || !(leg.dur > 0)) return leg.x1;
  const k = Math.max(0, Math.min(1, (now - leg.t0) / leg.dur));
  return leg.x0 + (leg.x1 - leg.x0) * k;
}

const legEnd = (leg) => leg.t0 + leg.dur;

// Where a session stands, or the middle of where it paces. Housemates spread out by `slot`.
// A home is global: `home % 8` is the building, `floor(home / 8)` the block it stands in.
export function standX(status, home, slot = 0) {
  const b = LAYOUT.buildings[home % 8] ?? LAYOUT.buildings[0];
  const at = Math.floor(home / 8) * BLOCK_W;
  if (status === "needs") return at + b.door[0] + 26 * [-1, 1, -2, 2][slot % 4];
  if (status === "done") return at + b.mailbox[0] + 22 + 16 * (slot % 4);
  if (status === "idle") return at + b.door[0] + 40 + 18 * (slot % 4);
  return at + b.door[0] + 12 * (slot % 4);
}

const stand = (x, t0, dur, face = "", bounce = false, rate = 1) => ({ x0: x, x1: x, t0, dur, face, walk: false, bounce, rate, nudge: 0 });

function walkTo(walker, x, target, t0, rate) {
  return { x0: x, x1: target, t0, dur: Math.abs(target - x) / (walker.speed * rate), face: target < x ? "-left" : "", walk: true, bounce: false, rate, nudge: 0 };
}

// A walker is first drawn standing where it is: an element that appears mid-leg would be put at the leg's end.
export function makeWalker(seat, now) {
  const lane = laneOf(seat.status);
  const walker = { ...seat, crowd: false, lane, speed: speedOf(seat.who, lane, seat.status), step: 0 };
  const x = standX(seat.status, seat.home, seat.slot) - (seat.status === "working" || seat.status === "stalled" ? PACE * (rnd(seat.slot + seat.home * 3) * 2 - 1) : 0);
  walker.leg = stand(x, now, MOUNT_MS);
  return walker;
}

export function makeCrowd(i, now, span = BLOCK_W) {
  const who = LAYOUT.people[i % LAYOUT.people.length].name;
  const walker = { id: `crowd-${i}`, who, status: "crowd", crowd: true, lane: "back", speed: speedOf(who, "back", "crowd"), step: 0, dir: rnd(i + 40) < 0.5 ? 1 : -1, span };
  walker.leg = stand(rnd(i + 70) * (span + 200) - 100, now, MOUNT_MS);
  return walker;
}

function nextLeg(walker, now, rate) {
  const prev = walker.leg;
  const x = prev.x1;
  const t0 = now - legEnd(prev) < LATE_MS ? legEnd(prev) : now;
  if (walker.crowd) {
    const span = walker.span ?? BLOCK_W;
    let target = walker.dir > 0 ? span + 100 : -100;
    if (Math.abs(x - target) < 1) { walker.dir = -walker.dir; target = walker.dir > 0 ? span + 100 : -100; }
    return walkTo(walker, x, target, t0, rate);
  }
  const centre = standX(walker.status, walker.home, walker.slot);
  if (walker.status === "working" || walker.status === "stalled") {
    const step = walker.step++ % 4;
    if (step === 0) return walkTo(walker, x, centre + PACE, t0, rate);
    if (step === 1) return stand(x, t0, REST_MS / rate, "", walker.status === "working", rate);
    if (step === 2) return walkTo(walker, x, centre - PACE, t0, rate);
    return stand(x, t0, REST_MS / rate, "-left", false, rate);
  }
  if (Math.abs(x - centre) > 1) return walkTo(walker, x, centre, t0, rate);
  return stand(centre, t0, Infinity, walker.status === "done" ? "-left" : "", false, rate);
}

/** Starts the next leg when the current one is over. Returns whether anything changed. */
export function advance(walker, now, rate = 1) {
  if (now < legEnd(walker.leg)) return false;
  walker.leg = nextLeg(walker, now, rate);
  return true;
}

// The same leg at another speed, from where the walker is now. The target is nudged by a
// hundredth of a pixel so the native transition takes the new duration.
export function retime(walker, now, rate) {
  const leg = walker.leg;
  if (leg.rate === rate || leg.dur === Infinity) { leg.rate = rate; return; }
  if (leg.walk) {
    const next = walkTo(walker, legX(leg, now), leg.x1, now, rate);
    next.face = leg.face;
    next.nudge = leg.nudge ? 0 : 0.01;
    walker.leg = next;
  } else {
    walker.leg = { ...leg, t0: now, dur: Math.max(0, legEnd(leg) - now) * (leg.rate / rate), rate };
  }
}

/** The street changed length: a crowd walker heading past the new end turns towards it from where it is now. */
export function respan(walker, span, now) {
  walker.span = span;
  const leg = walker.leg;
  if (!leg.walk || leg.x1 <= span + 100) return;
  const next = walkTo(walker, legX(leg, now), span + 100, now, leg.rate);
  next.nudge = leg.nudge;
  walker.leg = next;
}

/** A session changed status, building or place in the doorway: it walks from where it is to its new spot. */
export function restage(walker, seat, now, rate = 1) {
  const x = legX(walker.leg, now);
  Object.assign(walker, seat);
  walker.lane = laneOf(walker.status);
  walker.speed = speedOf(walker.who, walker.lane, walker.status);
  walker.step = 0;
  walker.leg = stand(x, now, 0);
  walker.leg = nextLeg(walker, now, rate);
}

/** A selected walker stops where it is, facing the way it faced, until it is released. */
export function halt(walker, now) {
  walker.leg = stand(legX(walker.leg, now), now, Infinity, walker.leg.face, false, 1);
}

/** Lets a halted walker go: the next advance picks its next leg from where it stands. */
export function release(walker, now) {
  const leg = walker.leg;
  walker.leg = stand(legX(leg, now), now, 0, leg.face);
}

export const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** The camera looks at scene x `camX`; this is the scaled street's left edge in a `viewW` wide strip. */
export function camLeft(camX, viewW, blocks = 1, scale = S) {
  const width = blocks * SCENE_W * scale;
  if (viewW >= width) return (viewW - width) / 2;
  return Math.max(viewW - width, Math.min(0, viewW / 2 - camX * scale));
}

export function camX(leg, now) {
  if (!(leg.dur > 0)) return leg.x1;
  const k = Math.max(0, Math.min(1, (now - leg.t0) / leg.dur));
  return leg.x0 + (leg.x1 - leg.x0) * ease(k);
}

const DRIFT_SPEED = 660 / 28000;

/** The two places the camera may rest: the view's half-width in from either end of the street. */
function driftEnds(viewW, blocks = 1, scale = S) {
  const lo = viewW / (2 * scale);
  return [lo, blocks * BLOCK_W - lo];
}

/** Scene x moved into the range the camera can look from in this view: the street's centre when the view covers it. */
export function camClamp(x, viewW, blocks = 1, scale = S) {
  const [lo, hi] = driftEnds(viewW, blocks, scale);
  if (hi - lo < 1) return (blocks * BLOCK_W) / 2;
  return Math.max(lo, Math.min(hi, x));
}

// Where the camera stands for a hold at scene x `p` in this view, found from the hold rather than
// from where the camera is, so a resize cannot lose it: `p` is clamped to the view's range.
function holdStop(p, dir, viewW, lo, hi, scale = S) {
  const reach = viewW / (2 * scale) - holdMargin(scale);
  return Math.max(lo, Math.min(hi, reach > 0 ? p + dir * reach : p));
}

// A leg from the camera's current x to a held walker's stop, or a standing leg when it is there already.
function toHold(x0, p, dir, now, viewW, lo, hi, scale = S) {
  const x1 = holdStop(p, dir, viewW, lo, hi, scale);
  const stay = Math.abs(x1 - x0) <= 1;
  return { x0, x1: stay ? x0 : x1, t0: now, dur: stay ? Infinity : Math.max(4000, Math.abs(x1 - x0) / DRIFT_SPEED), dir, held: true, at: p };
}

const hasHold = (leg, holds) => leg.held && leg.at != null && holds.some((p) => Math.abs(p - leg.at) <= 0.01);

// With nothing selected the camera wanders between the two ends of the street. When the view
// covers the whole street there is nowhere to go, so it stands at the centre. A hold is an
// asking walker's x: the camera stops far enough short of it for the walker and its bubble to be whole.
export function driftLeg(from, now, viewW, blocks = 1, towards = null, holds = [], scale = S) {
  const [lo, hi] = driftEnds(viewW, blocks, scale);
  if (hi - lo < 1) return { x0: (blocks * BLOCK_W) / 2, x1: (blocks * BLOCK_W) / 2, t0: now, dur: Infinity };
  const x0 = Math.max(lo, Math.min(hi, from));
  const target = towards ?? (Math.abs(x0 - lo) > Math.abs(x0 - hi) ? lo : hi);
  const dir = target === lo ? -1 : 1;
  const reach = viewW / (2 * scale) - holdMargin(scale);
  let x1 = target, held = false, at = null;
  if (reach > 0) {
    for (const p of holds) {
      if (dir > 0 && p + reach >= x0 - 0.5 && p + reach < x1) { x1 = p + reach; held = true; at = p; }
      else if (dir < 0 && p - reach <= x0 + 0.5 && p - reach > x1) { x1 = p - reach; held = true; at = p; }
    }
  }
  if (held && Math.abs(x1 - x0) <= 1) return { x0, x1: x0, t0: now, dur: Infinity, dir, held: true, at };
  return { x0, x1, t0: now, dur: Math.max(4000, Math.abs(x1 - x0) / DRIFT_SPEED), dir, held, at };
}

export function nextDrift(leg, now, viewW, blocks = 1, holds = [], scale = S) {
  const [lo, hi] = driftEnds(viewW, blocks, scale);
  if (hi - lo < 1) return driftLeg(leg.x1, now, viewW, blocks, null, [], scale);
  const x = Math.max(lo, Math.min(hi, leg.x1));
  if (hasHold(leg, holds)) return toHold(x, leg.at, (leg.dir ?? 1) > 0 ? 1 : -1, now, viewW, lo, hi, scale);
  if (leg.held) return driftLeg(x, now, viewW, blocks, (leg.dir ?? 1) > 0 ? hi : lo, holds, scale);
  return driftLeg(x, now, viewW, blocks, Math.abs(x - lo) > Math.abs(x - hi) ? lo : hi, holds, scale);
}

/** The drift planned again from where the camera is now, keeping the leg's direction. */
export function redrift(leg, now, viewW, blocks = 1, holds = [], scale = S) {
  const [lo, hi] = driftEnds(viewW, blocks, scale);
  if (hi - lo < 1) return driftLeg(camX(leg, now), now, viewW, blocks, null, [], scale);
  const x = Math.max(lo, Math.min(hi, camX(leg, now)));
  if (hasHold(leg, holds)) return toHold(x, leg.at, (leg.dir ?? 1) > 0 ? 1 : -1, now, viewW, lo, hi, scale);
  const towards = leg.dir == null ? null : leg.dir > 0 ? hi : lo;
  return driftLeg(x, now, viewW, blocks, towards, holds, scale);
}
