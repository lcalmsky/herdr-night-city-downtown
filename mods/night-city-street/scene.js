// The street's picture: the night scene assembled from parts, and one element per walker.
// The renderer has no scale, so every part is drawn at the current scale times its size, and
// nothing here is animated by the script: lights are opacity loops, movement is a `left`
// transition per leg. `scale` is the street mod's geometry for its block height (walk.geomFor).
import { div, image, PathBuilder } from "gpui-kit";
import { LAYOUT as L, CITY, UI } from "./manifest.js";
import { C, CITY_ART, UI_ART, STATUS, clipText, textWidth } from "./neon.js";
import { S, SCENE_W, SCENE_H, BLOCK_W, rnd, BUBBLE_TEXT_MAX, BUBBLE_PAD, BUBBLE_HALO } from "./walk.js";

const r2 = (n) => Math.round(n * 100) / 100;

// An opacity loop is clamped to 0..1, so a steep swing is a switch: on while the swing is below (or above) `c`.
const STEEP = 30;
const below = (c, period) => ({ from: STEEP * c + 0.5, to: STEEP * (c - 1) + 0.5, period, easing: "linear" });
const above = (c, period) => ({ from: -STEEP * c + 0.5, to: STEEP * (1 - c) + 0.5, period, easing: "linear" });
const swing = (from, to, period) => ({ from, to, period, easing: "ease-in-out" });

function part(file, x, y, table = CITY, base = CITY_ART, dx = 0, scale = S) {
  const [w, h, ax, ay] = table[file];
  return image(base + file).absolute().left(r2((x - ax) * scale + dx)).top(r2((y - ay) * scale)).w(r2(w * scale)).h(r2(h * scale));
}

const fill = () => div().absolute().left(0).top(0).size_full();

// Four frames shown 1 2 3 4 3 2, each a sixth of `period`: the loop only swings there and back.
function flipbook(frame, period) {
  return [
    fill().loop("opacity", below(1 / 6, period)).child(frame(0)),
    fill().loop("opacity", above(1 / 6, period)).child(fill().loop("opacity", below(1 / 2, period)).child(frame(1))),
    fill().loop("opacity", above(1 / 2, period)).child(fill().loop("opacity", below(5 / 6, period)).child(frame(2))),
    fill().loop("opacity", above(5 / 6, period)).child(frame(3)),
  ];
}

/**
 * The sky behind everything: it stays put while the camera moves and is drawn once across the
 * whole view, so no two copies can meet. `plane`: whether the plane is on its way across.
 */
export function skyNodes({ viewW, plane, scale = S }) {
  const sw = Math.round(SCENE_W * scale), sh = Math.round(SCENE_H * scale);
  const width = Math.max(viewW, sw);
  const out = [image(`${CITY_ART}bg/sky.svg`).absolute().left(0).top(0).w(r2(width)).h(sh)];
  for (let k = 0; k * sw < width; k++) {
    L.stars.forEach((s, i) => {
      out.push(part("bg/star-a.svg", s.x, s.y, CITY, CITY_ART, k * sw, scale));
      out.push(part("bg/star-b.svg", s.x, s.y, CITY, CITY_ART, k * sw, scale).loop("opacity", swing(0, 1, Math.round(2500 + rnd(i) * 4000))));
    });
  }
  out.push(part("bg/moon.svg", Math.max(120 / scale, Math.min(L.moon[0], (viewW - 180) / scale)), L.moon[1], CITY, CITY_ART, 0, scale));
  for (let k = 0; k * sw < width; k++) {
    L.clouds.forEach((c, i) => {
      const el = part(c.file, c.x, c.y, CITY, CITY_ART, k * sw, scale);
      const left = r2((c.x - CITY[c.file][2]) * scale + k * sw);
      out.push(el.loop("left", { from: left - 60, to: left + 60, period: 70000 + i * 13000, easing: "ease-in-out" }));
    });
  }
  const [pw, ph] = CITY["bg/plane.svg"];
  const planeImg = (file) => image(CITY_ART + file).absolute().left(0).top(0).w(r2(pw * scale)).h(r2(ph * scale));
  out.push(div().id("ncd-plane").absolute().left(plane ? r2(width + 200 * scale) : r2(-200 * scale)).top(r2((L.plane.y - ph / 2) * scale)).w(r2(pw * scale)).h(r2(ph * scale))
    .transition("left", { duration: plane ? PLANE_MS : 0, easing: "linear" })
    .child(planeImg("bg/plane.svg"))
    .child(planeImg("bg/plane-light.svg").opacity(0.1))
    .child(planeImg("bg/plane-light.svg").loop("opacity", below(0.125, 1200))));
  return out;
}

/**
 * One block of the street, back to front, at unit offset `block * BLOCK_W`.
 * `homes[i]`: { lit: 0..1, steam, urgent, flag } for building i of this block. `alarm`: the searchlights sweep fast.
 * `on`: the keyboard is on the street, so every sign, marquee and gate neon is drawn steadily instead of blinking.
 */
export function blockNodes({ block, homes, alarm, on, scale = S }) {
  const dx = block * BLOCK_W * scale;
  const at = (file, x, y) => part(file, x, y, CITY, CITY_ART, dx, scale);
  const out = [];
  const sweep = alarm ? 2400 : 7000;
  out.push(at("bg/searchlight-a.svg", 800, 100).loop("opacity", swing(1, 0, sweep)));
  out.push(at("bg/searchlight-b.svg", 800, 100).loop("opacity", swing(0, 1, sweep)));
  out.push(at("bg/backrow.svg", 800, 100));
  out.push(at("bg/glitter-a.svg", 800, 100).loop("opacity", swing(0, 1, 5200)));
  out.push(at("bg/glitter-b.svg", 800, 100).loop("opacity", swing(1, 0, 5200)));

  L.buildings.forEach((b, i) => {
    const d = `buildings/${b.id}`, home = homes[i];
    const glitter = Math.round(6000 + rnd(i) * 5000);
    out.push(at(`${d}/base.svg`, b.x, L.baseY));
    out.push(at(`${d}/glitter-a.svg`, b.x, L.baseY).loop("opacity", swing(0, 1, glitter)));
    out.push(at(`${d}/glitter-b.svg`, b.x, L.baseY).loop("opacity", swing(1, 0, glitter)));
    out.push(at(`${d}/lit.svg`, b.x, L.baseY).id(`ncd-lit-${block * L.buildings.length + i}`).opacity(home.lit).transition("opacity", { duration: 1200 }));
    if (on) out.push(at(`${d}/neon-bright.svg`, b.x, L.baseY));
    else {
      // The sign drops out for a blink now and then; fast and often when someone in the building needs you.
      const [dark, period] = home.urgent ? [0.22, 750] : [0.03, 5000 + i * 700];
      out.push(at(`${d}/neon-flicker.svg`, b.x, L.baseY).loop("opacity", below(dark, period)));
      out.push(at(`${d}/neon.svg`, b.x, L.baseY).loop("opacity", above(dark, period)));
    }
    if (home.steam) {
      [1, 2, 3].forEach((k) => {
        const rise = (k - 1) * 9;
        const top = r2((b.vent[1] - rise - CITY[`${d}/steam-${k}.svg`][3]) * scale);
        out.push(at(`${d}/steam-${k}.svg`, b.vent[0] + (k - 1) * 2, b.vent[1] - rise)
          .loop("opacity", swing(0.08, 0.85, 2600 + k * 850))
          .loop("top", { from: top, to: top - 7, period: 3900 + k * 1100, easing: "ease-in-out" }));
      });
    }
  });

  out.push(at("fx/screen-glow.svg", L.screen[0], L.screen[1] + 20));
  out.push(at("fx/screen.svg", L.screen[0], L.screen[1]));
  const [sw, sh, sax, say] = CITY["fx/screen-1.svg"];
  out.push(div().absolute().left(r2((L.screen[0] - sax) * scale + dx)).top(r2((L.screen[1] - say) * scale)).w(r2(sw * scale)).h(r2(sh * scale))
    .children(flipbook((k) => image(`${CITY_ART}fx/screen-${k + 1}.svg`).absolute().left(0).top(0).size_full(), 15000)));
  out.push(at("fx/marquee.svg", L.marquee[0], L.marquee[1]));
  if (on) {
    out.push(at("fx/marquee-a.svg", L.marquee[0], L.marquee[1]));
    out.push(at("fx/marquee-b.svg", L.marquee[0], L.marquee[1]));
  } else {
    out.push(at("fx/marquee-a.svg", L.marquee[0], L.marquee[1]).loop("opacity", below(0.5, 700)));
    out.push(at("fx/marquee-b.svg", L.marquee[0], L.marquee[1]).loop("opacity", above(0.5, 700)));
  }
  out.push(at("fx/garland-a.svg", 800, 100).loop("opacity", swing(0, 1, 2200)));
  out.push(at("fx/garland-b.svg", 800, 100).loop("opacity", swing(1, 0, 2200)));
  out.push(at("bg/ground.svg", 800, 100));
  out.push(at("bg/reflections-a.svg", 800, 100).loop("opacity", swing(0.5, 1, 1600)));
  out.push(at("bg/reflections-b.svg", 800, 100).loop("opacity", swing(1, 0.5, 1600)));

  L.buildings.forEach((b, i) => {
    out.push(at(`buildings/${b.id}/mailbox.svg`, b.mailbox[0], b.mailbox[1]));
    if (homes[i].flag) out.push(at(`buildings/${b.id}/mailbox-flag.svg`, b.mailbox[0], b.mailbox[1]));
  });
  for (const p of L.props) out.push(at(p.file, p.x, p.y));
  for (const lamp of L.lamps) { out.push(at(lamp.file, lamp.x, lamp.y)); out.push(at(lamp.lit, lamp.x, lamp.y)); }
  out.push(at("fx/gate.svg", L.gate[0], L.gate[1]));
  if (on) {
    out.push(at("fx/gate-neon-a.svg", L.gate[0], L.gate[1]));
    out.push(at("fx/gate-neon-b.svg", L.gate[0], L.gate[1]));
  } else {
    out.push(at("fx/gate-neon-a.svg", L.gate[0], L.gate[1]).loop("opacity", below(0.5, 1000)));
    out.push(at("fx/gate-neon-b.svg", L.gate[0], L.gate[1]).loop("opacity", above(0.5, 1000)));
  }
  out.push(at("fx/stall.svg", L.stall[0], L.stall[1]));
  out.push(at("fx/stall-light-a.svg", L.stall[0], L.stall[1]).loop("opacity", swing(1, 0, 3200)));
  out.push(at("fx/stall-light-b.svg", L.stall[0], L.stall[1]).loop("opacity", swing(0, 1, 3200)));
  out.push(at("fx/stall-steam-a.svg", L.stall[0], L.stall[1]).loop("opacity", swing(1, 0, 1800)));
  out.push(at("fx/stall-steam-b.svg", L.stall[0], L.stall[1]).loop("opacity", swing(0, 1, 1800)));
  out.push(at("fx/glow.svg", L.stall[0], L.stall[1] - 30).loop("opacity", swing(0.65, 0.85, 3200)));
  return out;
}

const ASK_MS = 1900;
export const PLANE_MS = 109000;

const TAIL = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("50%", "100%").close().build();

const BUBBLE_SIZE = 12, BUBBLE_H = 26;
// The narrowest a bubble's text may be clipped to: about fourteen Latin characters at BUBBLE_SIZE.
const BUBBLE_MIN_TEXT = textWidth("abcdefghijklmn", BUBBLE_SIZE, true);

/** The widest text a bubble holds at this scale: it shrinks with the scene, no narrower than ~14 characters. */
export function bubbleTextMax(scale = S) {
  return Math.max(BUBBLE_TEXT_MAX * scale / S, BUBBLE_MIN_TEXT);
}

/** A bubble's clipped text and width at this scale; the render and the overlap pass read the same numbers. */
export function bubbleBox(text, scale = S) {
  const label = clipText(text, bubbleTextMax(scale), BUBBLE_SIZE, true);
  return { label, w: textWidth(label, BUBBLE_SIZE, true) + BUBBLE_PAD };
}

/**
 * The last question of a session waiting for the person, over its head.
 * `here`: the walker's session is in the terminal with the keyboard, so the sign's border and tail are mustard.
 */
function bubble(text, id, w, scale = S, here = false) {
  const { label, w: bw } = bubbleBox(text, scale), bh = BUBBLE_H;
  const accent = here ? C.mustard : C.pink;
  // The renderer has no blur: two faint pink plates behind the sign stand in for a neon glow.
  const halo = (d, alpha) => div().absolute().left(-d).top(-d).w(bw + 2 * d).h(bh + 2 * d).rounded(8 + d).bg(`${C.pink}${alpha}`);
  return div().absolute().left(r2(w / 2 - bw / 2)).top(r2(-30 * scale - bh - 7)).w(bw).h(bh + 7)
    .child(halo(BUBBLE_HALO, "14")).child(halo(BUBBLE_HALO / 2, "2b"))
    .child(window.paint_path(TAIL(), accent).absolute().left(r2(bw / 2 - 6)).top(bh - 1).w(12).h(7))
    .child(div().id(`ncd-ask-${id}`).absolute().left(0).top(0).w(bw).h(bh).flex().items_center().justify_center().rounded(8).bg(C.card).border(1).border_color(accent)
      .text_size(BUBBLE_SIZE).font_weight(600).text_color(C.white).whitespace_nowrap().overflow_hidden().child(label))
    .child(window.paint_path(TAIL(), C.card).absolute().left(r2(bw / 2 - 5)).top(bh - 2).w(10).h(6));
}

/**
 * One walker. `o`: { opacity, selected, here, tint, ask (bubble text or null), tip, onClick, onRightClick }.
 * `here` marks the walker whose session is in the terminal that has the keyboard.
 * The element keeps its id for the walker's whole life, so its `left` transition carries on
 * across redraws; it is never moved to another parent.
 */
export function walkerNode(walker, o = {}) {
  const scale = o.scale ?? S;
  const lane = L.lanes[walker.lane], leg = walker.leg;
  const w = r2(60 * lane.scale * scale), h = r2(66 * lane.scale * scale);
  const top = r2(lane.y * scale - h);
  const frame = (k) => image(`${CITY_ART}people/${walker.who}/walk-${k + 1}${leg.face}.svg`).absolute().left(0).top(0).w(w).h(h);
  const el = div().id(`ncd-w-${walker.id}`).absolute().left(r2((leg.x1 - 30 * lane.scale) * scale) + leg.nudge).top(top).w(w).h(h)
    .transition("left", { duration: leg.walk ? Math.round(leg.dur) : 0, easing: "linear" })
    .opacity(o.opacity ?? 1).transition("opacity", { duration: 500 });
  if (leg.bounce) el.loop("top", { from: top, to: top - r2(2 * scale), period: 520, easing: "ease-out" });

  if (!walker.crowd) {
    const tint = o.tint ?? STATUS[walker.status].tint;
    el.child(div().id(`ncd-sel-${walker.id}`).absolute().left(0).top(0).w(w).h(h).opacity(o.selected ? 1 : 0).transition("opacity", { duration: 450 })
      .child(image(`${UI_ART}scene/spotlight.svg`).absolute().left(r2(w / 2 - 45 * scale)).top(r2(h - 150 * scale)).w(r2(90 * scale)).h(r2(150 * scale)))
      .child(image(`${UI_ART}scene/cursor-glow-${tint}.svg`).absolute().left(r2(w / 2 - 23 * scale)).top(r2(h - 12 * scale)).w(r2(46 * scale)).h(r2(20 * scale))
        .loop("opacity", swing(0.6, 1, 1200))));
  }

  const here = Boolean(o.here && !o.selected);
  if (here) {
    // Drawn before the walker's frames so it sits behind them, and steady: a blink is lost in the neon.
    el.child(div().id(`ncd-here-${walker.id}`).absolute().left(r2(w / 2 - 17 * scale)).top(r2(h - 4 * scale))
      .w(r2(34 * scale)).h(r2(8 * scale)).rounded_full().bg(C.mustard).opacity(0.45));
  }

  if (leg.walk) el.children(flipbook(frame, Math.min(12000, Math.round(1500 / (leg.rate * (walker.status === "stalled" ? 0.35 : 1))))));
  else if (walker.status === "done") el.child(frame(0).loop("opacity", below(0.5, 2860))).child(frame(2).loop("opacity", above(0.5, 2860)));
  else if (walker.status === "needs") {
    const ask = (k) => image(`${CITY_ART}people/${walker.who}/ask-${k}.svg`).absolute().left(0).top(0).w(w).h(h);
    el.child(ask(1).loop("opacity", below(0.6, ASK_MS))).child(ask(2).loop("opacity", above(0.6, ASK_MS)));
  } else el.child(frame(0));

  if (walker.crowd) return el;

  const [mw, mh] = UI["scene/marker-alert.svg"];
  const marker = image(`${UI_ART}scene/marker-${STATUS[walker.status].marker}.svg`).absolute().left(r2(w / 2 - (mw / 2) * scale)).top(r2(-(mh + 2) * scale)).w(r2(mw * scale)).h(r2(mh * scale));
  el.child(walker.status === "needs" ? marker.loop("opacity", { from: 0.55, to: 1, period: 1000, easing: "linear" }) : marker.opacity(0.9));
  if (walker.status === "idle") {
    const zt = r2(-10 * scale);
    el.child(image(`${CITY_ART}fx/z.svg`).absolute().left(r2(w / 2 + 8 * scale)).top(zt).w(r2(10 * scale)).h(r2(12 * scale))
      .loop("opacity", swing(0.15, 1, 2400)).loop("top", { from: zt, to: zt - 12, period: 4800, easing: "ease-in-out" }));
  }
  if (o.ask) el.child(bubble(o.ask, walker.id, w, scale, here));
  if (o.tip) el.tooltip(o.tip);
  if (o.onClick) el.cursor_pointer().on_click(o.onClick);
  if (o.onRightClick) el.on_mouse_down("right", o.onRightClick);
  return el;
}
