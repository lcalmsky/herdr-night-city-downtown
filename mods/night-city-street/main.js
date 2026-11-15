// Night City street: every session is a walker on a neon street, with the "Tonight" ticker
// under it. It scans the sessions (scan.sh, every 3 s), goes to a session's pane, opens page
// alerts, and publishes what the other night-city mods draw as shared("night-city").
// With props { role: "legend" } the same mod is the key legend dialog.
import { View, div, image, svg } from "gpui-kit";
import {
  exec, appHome, run, props, shared, setShared, nextCommand, openOverlay, closeOverlay,
  terminals, agents, panes, spaces, focused, settings, readTextFile, writeTextFile,
} from "herdr";
import { C, UI_ART, MONO, SHARED_KEY, QUERY_KEY, ACCOUNTS_KEY, words, paneTarget, tintOf, icon, gradient, kbd, segs, dot, portrait, ago, textWidth, clipText } from "./neon.js";
import {
  parseScan, buildItems, byUrgency, assignSeats, castOf, countsOf, tokensOf, matches, cycle, liveOf, terminalOf, focusMatch,
  visitHistory, stepHistory, nextSettings, nextFilter, inFilter, stepWindow, ASIDE_MS, STEP_ROWS,
  WHO, MAX_CAST, TERM_FONT, BUILDINGS,
} from "./model.js";
import { TICKER_H, STREET_MIN, STREET_MAX, geomFor, CROWD, SLOW, BLOCK_W, blocksFor, makeWalker, makeCrowd, advance, retime, respan, restage, halt, release, legX, standX, camLeft, camX, camClamp, driftLeg, nextDrift, redrift, drawOrder, bubblesHidden } from "./walk.js";
import { PLANE_MS, skyNodes, blockNodes, walkerNode, bubbleBox } from "./scene.js";
import { demoSessions, demoSeen, demoFocusMatch } from "./demo.js";

const POLL_MS = 3000, TICK_MS = 200, MODEL_EVERY = 5, NOTICE_MS = 4500, ATTACH_GRACE_MS = 15000, NAV_SETTLE_MS = 1000;
const HERE_EDGE = 80, PAN_MS = 700;
// The block height the picture was drawn at before it followed the window: 330 street + 40 ticker.
export const REF_BLOCK_H = 370;
// The tab bar (44px) and the plates (48px) are the window's other fixed bands; a layout that changes
// either size changes this too.
const WINDOW_BANDS_H = 44 + 48;
export const STREET_SHARE = 0.3;
// How far the target must move before the street asks for another resize: each one relayouts the window.
const STREET_STEP = 4;

/** The street block's height for a window height: 30% of what the tab bar and the plates leave, 200..400. */
export function streetPx(windowHeight) {
  return Math.max(STREET_MIN, Math.min(STREET_MAX, Math.round(STREET_SHARE * (windowHeight - WINDOW_BANDS_H))));
}

const FLYER_W = 330, LABEL_W = 117, TAPE_SPEED = 0.04, TAPE_GAP = 34;
// The flyer card's vertical metrics in px, used by the render and by the fit test.
export const FLYER = {
  top: 20, padX: 18, padTop: 16, padBottom: 14,
  borders: 4,
  portrait: 52, statusH: 15, nameMt: 2, nameH: 21, metaMt: 3, metaH: 15,
  checkMt: 12, checkH: 16, stepsMt: 10, stepsTitleH: 14, stepRowH: 18, stepGap: 3,
  askMt: 14, askPadX: 12, askPadY: 10, askLineH: 20, askMaxH: 64, askSize: 14, askClip: 540,
  aboutMt: 12, aboutH: 40,
  pagesMt: 10, pagesH: 17,
  buttonsMt: 14, buttonsH: 30,
};

// The header row: the portrait, or the three text lines beside it, whichever is taller.
const HEADER_H = Math.max(FLYER.portrait, FLYER.statusH + FLYER.nameMt + FLYER.nameH + FLYER.metaMt + FLYER.metaH);

/** The expanded card's height: header, checklist line when `check`, then `rows` step rows. */
export function expandedFlyerHeight(rows, check = true) {
  return FLYER.borders + FLYER.padTop + HEADER_H
    + (check ? FLYER.checkMt + FLYER.checkH : 0)
    + FLYER.stepsMt + FLYER.stepsTitleH
    + rows * (FLYER.stepRowH + FLYER.stepGap)
    + FLYER.padBottom;
}

/** How many lines `text` takes in `width`: greedy by word over the width estimate, since there is no measuring API. */
function wrappedLines(text, width, size, bold) {
  let lines = 1, line = "";
  for (const word of String(text ?? "").split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > width) { lines += 1; line = word; }
    else line = next;
  }
  return lines;
}

/** The lines the ask's box wants, before the box's cap or a short block takes any. */
export function askLinesWanted(ask) {
  const width = FLYER_W - FLYER.borders - 2 * FLYER.padX - 2 * FLYER.askPadX;
  return wrappedLines(clipText(ask, FLYER.askClip, FLYER.askSize, true), width, FLYER.askSize, true);
}

/** The ask box's height for `ask`: its padding twice plus a line per wrapped line, at most `lines` and `askMaxH`. */
export function askBoxHeight(ask, lines = Infinity) {
  return Math.min(FLYER.askMaxH, 2 * FLYER.askPadY + Math.min(lines, askLinesWanted(ask)) * FLYER.askLineH);
}

/** The height of the card `flyerNode` draws for `item` in this state: the header plus every row it shows. */
export function flyerCardHeight(item, { expanded = false, stepRows = 0, about = true, pages = true, check = true, askLines = Infinity } = {}) {
  if (expanded) return expandedFlyerHeight(stepRows, check && Boolean(item.check));
  return FLYER.borders + FLYER.padTop + HEADER_H
    + (item.ask ? FLYER.askMt + askBoxHeight(item.ask, askLines) : 0)
    + (about ? FLYER.aboutMt + FLYER.aboutH : 0)
    + (check && item.check ? FLYER.checkMt + FLYER.checkH : 0)
    + (pages ? FLYER.pagesMt + FLYER.pagesH : 0)
    + FLYER.buttonsMt + FLYER.buttonsH
    + FLYER.padBottom;
}

/**
 * The card for `item` at `blockH`: which optional rows it keeps, the height they make, and the top it
 * sits at. It keeps `top` unless that puts its foot past the block; a card too tall even at top 0 drops
 * its about line, then its pages row, step rows and the checklist, then squeezes the ask to fewer lines.
 * The header, the ask and the buttons always stay.
 */
export function flyerFit(item, { expanded = false, stepRows = 0, blockH = REF_BLOCK_H } = {}) {
  const open = Boolean(expanded) && item.steps.length > 0;
  let about = !open && Boolean(item.topic ?? item.line);
  let pages = !open && item.pages.length > 0;
  let rows = open ? Math.max(0, stepRows) : 0;
  let check = Boolean(item.check);
  let askLines = item.ask ? askLinesWanted(item.ask) : 0;
  const room = blockH - 4;
  const measure = () => flyerCardHeight(item, { expanded: open, stepRows: rows, about, pages, check, askLines });
  let height = measure();
  if (height > room && about) { about = false; height = measure(); }
  if (height > room && pages) { pages = false; height = measure(); }
  while (height > room && rows > 0) { rows -= 1; height = measure(); }
  if (height > room && check) { check = false; height = measure(); }
  while (height > room && askLines > 1) { askLines -= 1; height = measure(); }
  return { about, pages, check, askLines, stepRows: rows, expanded: open, height, top: Math.min(FLYER.top, Math.max(0, blockH - height - 8)) };
}

// The key help's geometry. The column-fit test reads these same numbers.
export const LEGEND = {
  width: 1000, height: 600, border: 1, padX: 28, padY: 20,
  colW: 300, colGap: 21, keyW: 88, textW: 202,
  rowH: 24, rowGap: 2, groupMb: 10, titleH: 16,
  headerH: 39, headerMt: 12, signW: 143, noteGap: 24,
  columns: [[0], [1, 2], [3, 4, 5]],
};
const HOLD_MS = 120;
export const AWAY_DIM = 0.3;
// A pick made from the street keeps the street lit, so only a light dim sets the picked walker apart.
export const PICK_DIM_STREET = 0.2;
const SEEN_KEY = "night-city.seen";
export const NOTICE_KEY = "night-city.notice";
const r2 = (n) => Math.round(n * 100) / 100;
const stop = (_event, cx) => cx.stop_propagation();
const isHttp = (url) => typeof url === "string" && /^https?:\/\//.test(url);

/** The ticker's cells with the widths they are drawn at: there is no text measuring, so the tape's length is decided here. */
export function tapeOf(items, idle = false) {
  const cells = items.filter((item) => idle || item.status !== "idle").map((item) => {
    const text = clipText(item.ask || item.line || item.topic || "", 420, 13);
    const wn = Math.ceil(textWidth(item.name, 13, true) * 1.08) + 4, wt = text ? Math.ceil(textWidth(text, 13) * 1.08) + 4 : 0;
    return { id: item.id, tint: item.tint, name: item.name, text, wn, wt, w: 7 + 10 + wn + (wt ? 10 + wt : 0) + TAPE_GAP };
  });
  return { cells, width: cells.reduce((sum, cell) => sum + cell.w, 0) };
}

/** Where the flyer card goes for a walker at strip x: to its right, or to its left near the right edge
 * or while the accounts popup (which opens over the right side) is up and the left has room. */
export function flyerLeft(x, viewW, preferLeft = false) {
  const right = x + 70, left = x - 70 - FLYER_W;
  if (preferLeft && left >= 16) return left;
  return Math.max(16, right + FLYER_W > viewW - 16 ? left : right);
}

export default class Street extends View {
  init(_props, cx) {
    const given = props() ?? {};
    this.role = given.role ?? "street";
    this.autosize = given.autosize !== false;
    this.streetSent = null;
    this.lang = given.lang === "ko" ? "ko" : "en";
    if (this.role === "legend") {
      this.handle = cx.focus_handle();
      cx.timer.after(60, () => this.handle.focus());
      return;
    }
    const now = Date.now();
    this.demo = Boolean(given.demo);
    this.demoCount = Number.isFinite(Number(given.sessions)) && Number(given.sessions) > 0 ? Math.floor(Number(given.sessions)) : 8;
    this.handle = cx.focus_handle();
    this.keyboard = false;
    // GPUI's own Tab binding moves focus before on_key_down sees it.
    if (typeof cx.bind_keys === "function") {
      cx.bind_keys([
        { keystroke: "tab", action: "ncd_street_next", context: "NightCityStreet" },
        { keystroke: "shift-tab", action: "ncd_street_prev", context: "NightCityStreet" },
      ]);
    }
    this.width = 1440;
    this.blockH = 0;
    this.geom = geomFor(REF_BLOCK_H);
    this.scale = this.geom.scale;
    this.blocks = 0;
    this.sessions = this.demo ? demoSessions(now, this.demoCount) : [];
    this.meta = null;
    this.err = null;
    this.scanned = this.demo;
    this.seen = this.demo ? demoSeen(this.sessions) : this.loadSeen();
    this.seats = new Map();
    this.walkers = new Map();
    this.crowd = [];
    this.items = [];
    this.sel = null;
    this.flyer = null;
    this.filter = null;
    this.aside = {};
    this.expanded = new Set();
    this.stepTop = new Map();
    this.menu = null;
    this.helpOpen = false;
    this.legendId = null;
    this.legendFrom = null;
    this.demoOpen = null;
    this.demoOpens = 0;
    this.here = null;
    this.bornAt = now;
    this.last = null;
    this.askCursor = null;
    this.resultCursor = null;
    this.holdSig = "";
    this.cam = { x0: 0, x1: 0, t0: now, dur: 0 };
    this.plane = { go: false, at: now };
    this.tape = { cells: [], width: 0 };
    this.run = { x0: 0, x1: 0, t0: now, dur: Infinity, walk: false };
    this.hover = false;
    this.history = { list: [], at: -1 };
    this.ticks = 0;
    this.refresh(now);
    const urgent = this.items[0] ? this.walkers.get(this.items[0].id) : null;
    if (urgent && this.items[0].status === "needs") {
      const x = camClamp(standX(urgent.status, urgent.home, urgent.slot), this.width, this.blocks, this.scale);
      this.cam = { x0: x, x1: x, t0: now, dur: 4000 };
    } else {
      const lo = this.width / (2 * this.scale);
      this.cam = { x0: lo, x1: lo, t0: now, dur: 400 };
    }
    const pick = typeof given.pick === "string" ? given.pick : null;
    if (this.demo && pick) {
      cx.timer.after(60, (later) => {
        if (!this.walkers.has(pick)) return;
        this.select(pick);
        later.notify();
      });
    }
    cx.timer.every(TICK_MS, (cx) => this.tick(cx));
    cx.timer.after(60, () => this.syncStreet());
    if (!this.demo) {
      cx.timer.every(POLL_MS, (cx) => this.poll(cx));
      this.poll(cx);
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        await this.command(command, cx);
        cx.notify();
      }
    });
  }

  loadSeen() {
    try {
      const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
      return Array.isArray(list) ? list.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  }

  saveSeen() {
    if (this.demo) return;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(this.seen)); } catch {}
  }

  poll(cx) {
    if (this.scanning) return;
    this.scanning = true;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("sh", [`${appHome()}/mods/night-city-street/scan.sh`]);
        if (result.code !== 0) throw new Error((result.stderr || result.stdout || "").trim() || `scan.sh exited ${result.code}`);
        const parsed = parseScan(result.stdout);
        this.sessions = parsed.sessions;
        this.meta = parsed.meta;
        this.err = parsed.meta?.error ?? null;
        this.scanned = true;
      } catch (error) {
        this.err = String(error?.message ?? error);
      }
      this.scanning = false;
      this.refresh(Date.now());
      this.publishNotice();
      cx.notify();
    });
  }

  retry(cx) {
    if (this.demo) return;
    this.poll(cx);
  }

  rateOf(id) {
    return this.sel && id !== this.sel ? SLOW : 1;
  }

  holds() {
    const xs = [];
    for (const walker of this.walkers.values()) if (walker.status === "needs") xs.push(standX("needs", walker.home, walker.slot));
    return xs;
  }

  // Rebuilds the sessions from the last scan and Herdr's live data, and moves the walkers to match. Returns whether anything shown changed.
  refresh(now) {
    const herdr = this.demo ? { terminals: [], agents: [], panes: [], spaces: [] }
      : { terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces() };
    for (const [id, until] of Object.entries(this.aside)) if (until <= now) delete this.aside[id];
    const all = byUrgency(buildItems({ sessions: this.sessions, meta: this.meta, herdr, now, seen: this.seen }), this.aside, now);
    const items = all.slice(0, MAX_CAST);
    const grown = this.updateBlocks(items, now);
    this.seats = assignSeats(this.seats, items.map((item) => item.id), this.blocks * BUILDINGS);
    const housemates = [];
    const slots = new Map();
    for (const [id, seat] of this.seats) { slots.set(id, housemates[seat.home] ?? 0); housemates[seat.home] = (housemates[seat.home] ?? 0) + 1; }
    const ids = new Set();
    for (const item of items) {
      ids.add(item.id);
      const seat = this.seats.get(item.id);
      item.who = WHO[seat.who];
      item.home = seat.home;
      const place = { id: item.id, who: item.who, status: item.status, home: seat.home, slot: slots.get(item.id) };
      const walker = this.walkers.get(item.id);
      if (!walker) this.walkers.set(item.id, makeWalker(place, now));
      else if (walker.status !== place.status || walker.home !== place.home || walker.slot !== place.slot) {
        restage(walker, place, now, this.rateOf(item.id));
        if (item.id === this.sel) halt(walker, now);
      }
    }
    for (const id of [...this.walkers.keys()]) if (!ids.has(id)) this.walkers.delete(id);
    for (const id of [...this.expanded]) if (!ids.has(id)) { this.expanded.delete(id); this.stepTop.delete(id); }
    if (this.menu && !ids.has(this.menu.id)) this.menu = null;
    this.items = items;
    if (this.sel && !ids.has(this.sel)) this.select(null, now);
    if (this.here && !ids.has(this.here)) this.here = null;
    const holds = this.holds();
    const holdSig = holds.slice().sort((a, b) => a - b).join(",");
    let replanned = false;
    if (!this.sel && !this.hereHeld() && holdSig !== this.holdSig) {
      const next = redrift(this.cam, now, this.width, this.blocks, holds, this.scale);
      // Only a running leg is kept: a standing one would never end, and the tick would never plan again.
      if (Math.abs(next.x1 - this.cam.x1) < 0.01 && Number.isFinite(this.cam.dur)) {
        this.cam.held = next.held;
        this.cam.dir = next.dir;
        this.cam.at = next.at;
      } else {
        this.cam = next;
        replanned = true;
      }
    }
    this.holdSig = holdSig;
    // Read marks are only dropped for sessions a good scan no longer lists: a failed scan lists none.
    if (this.scanned && !this.err && all.length) {
      const alive = new Set(all.map((item) => item.ackKey));
      const kept = this.seen.filter((key) => alive.has(key));
      if (kept.length !== this.seen.length) { this.seen = kept; this.saveSeen(); }
    }
    this.retape(now);
    this.publish();
    const sig = JSON.stringify(items.map((i) => [i.id, i.status, i.name, i.ask, i.line, i.topic, i.ticket, i.check, i.pages.length, i.terminal, i.pane, i.space, i.who, i.home]));
    const changed = sig !== this.sig || grown || replanned;
    this.sig = sig;
    return changed;
  }

  // How many blocks the view, the sessions and the homes in use ask for; true when it changed.
  updateBlocks(items, now) {
    let maxHome = -1;
    for (const item of items) {
      const seat = this.seats.get(item.id);
      if (seat && seat.home > maxHome) maxHome = seat.home;
    }
    const blocks = blocksFor({ viewW: this.width, count: items.length, maxHome, scale: this.scale });
    if (blocks === this.blocks) return false;
    this.blocks = blocks;
    this.syncCrowd(now);
    this.snapCamera(now);
    return true;
  }

  // The crowd has CROWD walkers per block; a kept walker heading past a new street end turns at it.
  syncCrowd(now) {
    const span = this.blocks * BLOCK_W;
    while (this.crowd.length < CROWD * this.blocks) this.crowd.push(makeCrowd(this.crowd.length, now, span));
    while (this.crowd.length > CROWD * this.blocks) this.crowd.pop();
    for (const walker of this.crowd) respan(walker, span, now);
  }

  // Stops the camera where it is with no transition, so a resized view is never cut for the rest of a leg.
  snapCamera(now) {
    const x = camClamp(this.sel ? this.cam.x1 : camX(this.cam, now), this.width, this.blocks, this.scale);
    this.cam = { x0: x, x1: x, t0: now, dur: 0, dir: this.cam.dir, held: this.cam.held, at: this.cam.at };
  }

  visible(item, tokens = tokensOf(shared(QUERY_KEY))) {
    return (!tokens.length || matches(item, tokens)) && inFilter(item, this.filter);
  }

  shown() {
    const tokens = tokensOf(shared(QUERY_KEY));
    return tokens.length || this.filter ? this.items.filter((item) => this.visible(item, tokens)) : this.items;
  }

  runWidth() {
    return Math.max(120, this.width - LABEL_W - 300);
  }

  // The tape scrolls only when it is longer than its window. A new length holds it where it is for
  // a moment (an element drawn for the first time mid-scroll would be put at the scroll's end), then it carries on.
  retape(now) {
    const narrowed = Boolean(this.filter) || tokensOf(shared(QUERY_KEY)).length > 0;
    const tape = tapeOf(this.shown(), narrowed);
    const moved = tape.width !== this.tape.width;
    this.tape = tape;
    if (!moved) return;
    const x = tape.width > this.runWidth() ? Math.max(-tape.width, legX(this.run, now)) : 0;
    this.run = { x0: x, x1: x, t0: now, dur: this.hover || tape.width <= this.runWidth() ? Infinity : HOLD_MS, walk: false };
  }

  stepTape(now) {
    if (this.hover || this.tape.width <= this.runWidth() || now < this.run.t0 + this.run.dur) return false;
    this.run = this.run.walk
      ? { x0: 0, x1: 0, t0: now, dur: HOLD_MS, walk: false }
      : { x0: this.run.x1, x1: -this.tape.width, t0: now, dur: (this.tape.width + this.run.x1) / TAPE_SPEED, walk: true };
    return true;
  }

  hoverTape(hovered) {
    const now = Date.now();
    this.hover = hovered;
    const x = legX(this.run, now);
    this.run = { x0: x, x1: x, t0: now, dur: hovered || this.tape.width <= this.runWidth() ? Infinity : 0, walk: false };
  }

  publish() {
    const value = { sel: this.sel, lang: this.lang, cast: castOf(this.items, this.seats), counts: countsOf(this.items) };
    if (this.demoOpen) value.demoOpen = this.demoOpen;
    // The demo terminals keep their focus mark in this same value; a republish here must carry it along.
    const focus = this.demo ? shared(SHARED_KEY)?.demoFocus : null;
    if (focus) value.demoFocus = focus;
    const text = JSON.stringify(value);
    if (text === this.published) return;
    this.published = text;
    setShared(SHARED_KEY, value);
  }

  publishNotice() {
    const undo = Boolean(this.notice?.undo && this.last);
    const value = this.err ? { tone: "err", text: this.err, retry: true }
      : this.notice ? { tone: "note", text: this.notice.text, ...(undo ? { undo: true } : {}) }
      : null;
    const text = JSON.stringify(value);
    if (text === this.publishedNotice) return;
    this.publishedNotice = text;
    setShared(NOTICE_KEY, value);
  }

  flash(text, { undo } = {}) {
    this.notice = { text, until: Date.now() + NOTICE_MS, undo: Boolean(undo) };
    this.publishNotice();
  }

  // Sizes the street's block to the window, so half the window is half the street. A target within
  // 4px of the last one sent is left alone, and the same value is never sent twice.
  syncStreet() {
    if (!this.autosize) return;
    let windowH;
    try { windowH = window.viewport_size().height; } catch { return; }
    if (!Number.isFinite(windowH) || windowH <= 0) return;
    // The viewport is in zoomed pixels while layout sizes are not.
    const zoom = Number(settings()?.zoom);
    const px = streetPx(zoom > 0 ? windowH / zoom : windowH);
    if (this.streetSent != null && Math.abs(px - this.streetSent) < STREET_STEP) return;
    this.streetSent = px;
    run("layout.resize", { id: "street", px });
  }

  tick(cx) {
    const now = Date.now();
    this.syncStreet();
    let changed = false;
    const keyboard = this.handle.is_focused();
    if (keyboard !== this.keyboard) {
      // Something else can take the keyboard without telling this mod; a flyer left open would then let Esc reach a terminal.
      // Demo has no real terminal, so nothing can leak Esc there and the flyer stays for the capture.
      if (!this.demo && !keyboard && this.keyboard && this.sel && !this.helpOpen) this.select(null);
      this.keyboard = keyboard;
      changed = true;
    }
    for (const walker of this.crowd) changed = advance(walker, now, this.sel ? SLOW : 1) || changed;
    for (const walker of this.walkers.values()) changed = advance(walker, now, this.rateOf(walker.id)) || changed;
    const here = this.keyboard && this.sel ? null : this.hereOf();
    if (here !== this.here) { this.here = here; changed = true; }
    const held = this.hereHeld();
    if (held && this.panToHere(now)) changed = true;
    if (!held && !this.sel && now >= this.cam.t0 + this.cam.dur) { this.cam = nextDrift(this.cam, now, this.width, this.blocks, this.holds(), this.scale); changed = true; }
    if (now - this.plane.at > (this.plane.go ? PLANE_MS : 300)) { this.plane = { go: !this.plane.go, at: now }; changed = true; }
    if (this.stepTape(now)) changed = true;
    if (this.notice && now > this.notice.until) { this.notice = null; this.publishNotice(); }
    this.trackVisit(now);
    if (++this.ticks % MODEL_EVERY === 0 && this.refresh(now)) changed = true;
    if (changed) cx.notify();
  }

  // The camera belongs to the marked walker while the keyboard is elsewhere and nothing is picked.
  hereHeld() {
    return Boolean(this.here) && !this.sel && !this.keyboard;
  }

  // Pans the camera onto the marked walker when it is out of view or near an edge, with the same
  // eased move a picked walker gets, and again whenever walking takes it back there. Returns
  // whether the camera moved.
  panToHere(now) {
    const walker = this.walkers.get(this.here);
    if (!walker) return false;
    const x = legX(walker.leg, now);
    const screen = x * this.scale + camLeft(this.cam.x1, this.width, this.blocks, this.scale);
    if (screen >= HERE_EDGE && screen <= this.width - HERE_EDGE) return false;
    const target = camClamp(x, this.width, this.blocks, this.scale);
    if (Math.abs(target - this.cam.x1) <= 0.5) return false;
    this.cam = { x0: camX(this.cam, now), x1: target, t0: now, dur: PAN_MS };
    return true;
  }

  // The walker whose session is in the terminal with the keyboard. A selection made from the street outranks it.
  hereOf() {
    if (this.demo) return demoFocusMatch(this.items, shared(SHARED_KEY)?.demoFocus, this.bornAt);
    return focusMatch(this.items, focused());
  }

  select(id, now = Date.now()) {
    if (id === this.sel) return;
    this.menu = null;
    const prev = this.sel ? this.walkers.get(this.sel) : null;
    if (prev) release(prev, now);
    this.sel = id;
    const walker = id ? this.walkers.get(id) : null;
    if (walker) halt(walker, now);
    for (const walker of this.crowd) retime(walker, now, id ? SLOW : 1);
    for (const walker of this.walkers.values()) retime(walker, now, this.rateOf(walker.id));
    const at = camX(this.cam, now);
    if (walker) {
      this.flyer = id;
      this.cam = { x0: at, x1: camClamp(legX(walker.leg, now), this.width, this.blocks, this.scale), t0: now, dur: 700 };
    } else {
      this.cam = driftLeg(at, now, this.width, this.blocks, null, this.holds(), this.scale);
    }
    this.publish();
  }

  stepSelection(delta) {
    const id = cycle(this.shown(), this.sel, delta);
    if (id) this.select(id);
  }

  markRead(item) {
    if (!item || item.status !== "done" || this.seen.includes(item.ackKey)) return;
    this.seen = [...this.seen, item.ackKey];
    this.last = { kind: "read", key: item.ackKey };
    this.saveSeen();
    this.refresh(Date.now());
    this.flash(words(this.lang).marked, { undo: true });
  }

  putAside(item) {
    if (!item || item.status !== "stalled") return;
    this.aside[item.id] = Date.now() + ASIDE_MS;
    this.last = { kind: "aside", id: item.id };
    this.refresh(Date.now());
    this.flash(words(this.lang).putAside, { undo: true });
  }

  readAt(item) {
    if (!item) return;
    if (item.status === "done") this.markRead(item);
    else if (item.status === "stalled") this.putAside(item);
  }

  undoLast() {
    const last = this.last;
    if (!last) return;
    this.last = null;
    const t = words(this.lang);
    if (last.kind === "read") {
      this.seen = this.seen.filter((key) => key !== last.key);
      this.saveSeen();
      this.flash(t.undoneRead);
    } else if (last.kind === "aside") {
      delete this.aside[last.id];
      this.flash(t.undoneAside);
    }
    this.refresh(Date.now());
  }

  goTo(item, cx) {
    if (!item) return;
    this.markRead(item);
    if (this.demo) {
      const slot = this.demoOpens % 4;
      this.demoOpens += 1;
      this.demoOpen = {
        id: item.id, name: item.name, ask: item.ask || null,
        lastSentence: item.line ?? item.raw?.lastSentence ?? null,
        status: item.status, at: Date.now(), slot,
      };
      this.select(null);
      this.publish();
      return;
    }
    const t = words(this.lang);
    if (!item.raw) {
      run("pane.focus", item.pane ? { pane: item.pane } : { terminal: item.terminal });
      return;
    }
    const live = liveOf(terminals());
    const terminal = terminalOf(item.raw, live);
    if (terminal) {
      const pane = panes().find((candidate) => candidate.terminal === terminal.address);
      run("pane.focus", pane ? { pane: pane.pane } : { terminal: terminal.address });
      return;
    }
    const where = item.raw.where ?? {};
    if (where.kind === "claude-bg") {
      if (where.paneId && panes().some((candidate) => candidate.pane === where.paneId)) { run("pane.focus", { pane: where.paneId }); return; }
      if (where.terminalId && live.some((candidate) => candidate.address === where.terminalId)) {
        const pane = panes().find((candidate) => candidate.terminal === where.terminalId);
        run("pane.focus", pane ? { pane: pane.pane } : { terminal: where.terminalId });
        return;
      }
      // The scan that would report the new attach pane runs seconds later; a second press meanwhile must not open another.
      const opened = this.attached?.[where.attachId];
      if (opened && Date.now() - opened < ATTACH_GRACE_MS) return;
      this.attached = { ...this.attached, [where.attachId]: Date.now() };
      run("pane.split", { direction: "right", argv: ["claude", "attach", where.attachId] });
      return;
    }
    if (where.kind === "tmux" && where.paneId) {
      const base = where.socket ? ["-S", where.socket] : [];
      cx.spawn(async () => {
        for (const call of ["switch-client", "select-window", "select-pane"]) {
          try { await exec("tmux", [...base, call, "-t", where.paneId]); } catch {}
        }
      });
      return;
    }
    if (where.handle) {
      cx.spawn(async (cx) => {
        let ok = false;
        try {
          const result = await exec("/Applications/Orca.app/Contents/Resources/bin/orca", ["terminal", "switch", "--terminal", where.handle, "--json"]);
          ok = result.code === 0;
          if (ok) await exec("open", ["-a", "Orca"]);
        } catch {}
        if (!ok) { this.flash(t.nowhere); cx.notify(); }
      });
      return;
    }
    this.flash(t.nowhere);
  }

  // Opens a session's page alerts in the browser; an alert's files go once its page opened.
  openPages(item, cx) {
    if (!item || !item.pages.length) { this.flash(words(this.lang).noPage); return; }
    if (this.demo) return;
    cx.spawn(async () => {
      for (const page of item.pages) await this.openPage(page);
    });
  }

  async openPage(page) {
    if (this.demo || !page?.url) return;
    let opened = false;
    try { opened = (await exec("open", [page.url])).code === 0; } catch {}
    if (!opened) return;
    try { if (page.files?.length) await exec("rm", ["-f", ...page.files]); } catch {}
  }

  openOldestPage(cx) {
    const pages = [];
    for (const item of this.items) for (const page of item.pages) pages.push({ page, item });
    const meta = Array.isArray(this.meta?.pages) ? this.meta.pages : [];
    const oldest = meta.find((page) => page?.openable) ?? pages
      .map((entry) => entry.page)
      .sort((a, b) => (a.oldestCreatedAt ?? a.createdAt ?? 0) - (b.oldestCreatedAt ?? b.createdAt ?? 0))[0];
    if (!oldest) { this.flash(words(this.lang).noPage); return; }
    const owner = pages.find((entry) => entry.page === oldest)?.item
      ?? this.items.find((item) => item.pages.some((page) => page.pageId === oldest.pageId || page.url === oldest.url))
      ?? this.items.find((item) => item.id === oldest.sessionId);
    if (owner) this.select(owner.id);
    if (this.demo) return;
    cx.spawn(async () => { await this.openPage(oldest); });
  }

  jumpTo(kind) {
    const t = words(this.lang);
    const order = this.shown();
    const candidates = kind === "ask"
      ? order.filter((item) => item.status === "needs")
      : order.filter((item) => item.status === "done").reverse();
    if (!candidates.length) { this.flash(kind === "ask" ? t.noAsk : t.noResult); return; }
    const cursor = kind === "ask" ? "askCursor" : "resultCursor";
    const at = candidates.findIndex((item) => item.id === this[cursor]);
    const target = at < 0 ? candidates[0] : candidates[(at + 1) % candidates.length];
    this[cursor] = target.id;
    this.select(target.id);
  }

  stepsShown(item) {
    const { maxTop } = stepWindow(item.steps);
    const top = Math.min(this.stepTop.get(item.id) ?? 0, maxTop);
    return { top, maxTop, rows: item.steps.slice(top, top + STEP_ROWS) };
  }

  fitOf(item) {
    const stepRows = item.steps.length ? this.stepsShown(item).rows.length : 0;
    return flyerFit(item, { expanded: this.expanded.has(item.id), stepRows, blockH: this.geom.blockH });
  }

  openSteps(item) {
    if (!item || !item.steps.length) return;
    const { focus, maxTop } = stepWindow(item.steps);
    this.stepTop.set(item.id, Math.min(Math.max(focus - 1, 0), maxTop));
    this.expanded.add(item.id);
  }

  scrollSteps(item, delta) {
    const { top, maxTop } = this.stepsShown(item);
    this.stepTop.set(item.id, Math.max(0, Math.min(maxTop, top + delta)));
  }

  collapseSteps(item) {
    if (!item) return;
    this.expanded.delete(item.id);
    this.stepTop.delete(item.id);
  }

  expand(picked) {
    if (!picked) {
      const first = this.shown()[0];
      if (first) this.select(first.id);
      return;
    }
    if (!picked.steps.length) return;
    if (!this.expanded.has(picked.id)) this.openSteps(picked);
    else this.scrollSteps(picked, 1);
  }

  collapse(picked) {
    if (!picked) return;
    if (!this.expanded.has(picked.id)) return;
    const { top } = this.stepsShown(picked);
    if (top > 0) this.scrollSteps(picked, -1);
    else this.collapseSteps(picked);
  }

  toggleSteps(item) {
    if (!item) return;
    if (this.expanded.has(item.id)) this.collapseSteps(item);
    else this.openSteps(item);
  }

  setFilter(filter) {
    this.filter = filter;
    this.retape(Date.now());
    this.flash(words(this.lang).filters[filter ?? "all"]);
  }

  cycleFilter() {
    this.setFilter(nextFilter(this.filter));
  }

  stopIdOf(item) {
    if (!item?.raw || item.raw.kind !== "bg") return null;
    return item.raw.jobId ?? item.raw.where?.attachId ?? null;
  }

  linkUrls(item) {
    const urls = [];
    const push = (url) => { if (isHttp(url) && !urls.includes(url)) urls.push(url); };
    push(item?.raw?.deadhd?.keyHref);
    push(item?.raw?.pr?.url);
    push(item?.raw?.deadhd?.pr?.href);
    for (const page of item?.pages ?? []) push(page.url);
    return urls;
  }

  openLink(url, cx) {
    if (this.demo || !isHttp(url)) return;
    cx.spawn(async () => { try { await exec("open", [url]); } catch {} });
  }

  menuRows(item) {
    if (!item) return [];
    const t = words(this.lang);
    const rows = [{ id: "go", label: item.status === "needs" ? t.answer : t.open, run: (cx) => this.goTo(item, cx) }];
    if (item.pages.length) rows.push({ id: "pages", label: t.menuPages, run: (cx) => this.openPages(item, cx) });
    const ticket = item.raw?.deadhd?.keyHref;
    if (isHttp(ticket)) rows.push({ id: "ticket", label: t.menuTicket, run: (cx) => this.openLink(ticket, cx) });
    const pr = item.raw?.pr?.url ?? item.raw?.deadhd?.pr?.href;
    if (isHttp(pr)) rows.push({ id: "pr", label: t.menuPr, run: (cx) => this.openLink(pr, cx) });
    if (this.linkUrls(item).length) rows.push({ id: "copy", label: t.menuCopy, run: (cx) => cx.write_to_clipboard?.(this.linkUrls(item).join("\n")) });
    if (item.steps.length) rows.push({ id: "steps", label: t.menuSteps, run: () => this.toggleSteps(item) });
    const stopId = this.stopIdOf(item);
    if (stopId) rows.push({ id: "stop", label: t.menuStop, run: (cx) => this.stopSession(stopId, cx) });
    return rows;
  }

  openMenu(item) {
    if (!item) return;
    this.menu = { id: item.id, at: 0, rows: this.menuRows(item) };
  }

  openMenuFor() {
    return this.menu && this.menu.id === this.sel ? this.menu : null;
  }

  stopSession(stopId, cx) {
    if (this.demo) return;
    cx.spawn(async () => {
      let result = null;
      try { result = await exec("sh", ["-lc", 'claude stop "$1"', "x", stopId]); } catch {}
      if (!result || result.code !== 0) this.flash(words(this.lang).stopFailed);
    });
  }

  act(name, cx) {
    const picked = this.items.find((item) => item.id === this.sel) ?? null;
    if (name === "first" || name === "last") {
      const order = this.shown();
      const target = name === "first" ? order[0] : order[order.length - 1];
      if (target) this.select(target.id);
    } else if (name === "pages") {
      if (picked && picked.pages.length) this.openPages(picked, cx);
      else this.flash(words(this.lang).noPage);
    } else if (name === "oldest_page") {
      this.openOldestPage(cx);
    } else if (name === "read") {
      this.readAt(picked);
    } else if (name === "undo") {
      this.undoLast();
    } else if (name === "ask" || name === "result") {
      this.jumpTo(name);
    } else if (name === "expand") {
      this.expand(picked);
    } else if (name === "collapse") {
      this.collapse(picked);
    } else if (name === "menu") {
      if (this.openMenuFor()) {
        this.menu = null;
      } else if (picked) {
        if (this.helpOpen) {
          this.closeLegend();
        }
        this.openMenu(picked);
      }
    } else if (name === "filter") {
      this.cycleFilter();
    } else {
      return false;
    }
    return true;
  }

  trackVisit(now) {
    const terminal = this.demo ? null : focused()?.terminal ?? null;
    if (!terminal) return;
    if (this.navTarget) {
      if (terminal === this.navTarget) { this.navTarget = null; return; }
      if (now < this.navUntil) return;
      this.navTarget = null;
    }
    this.history = visitHistory(this.history, terminal);
  }

  navigate(delta) {
    const alive = new Set(liveOf(terminals()).map((terminal) => terminal.address));
    const { history, target } = stepHistory(this.history, delta, alive);
    if (!target) return;
    this.history = history;
    this.navTarget = target;
    this.navUntil = Date.now() + NAV_SETTLE_MS;
    run("pane.focus", { terminal: target });
  }

  // settings.json is the person's file: only the text size is touched, and a stale snapshot is read again.
  async changeFont(command) {
    const file = `${appHome()}/settings.json`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await readTextFile(file);
        const next = nextSettings(raw ? JSON.parse(raw) : {}, command, Number(settings()?.font_size) || TERM_FONT);
        if (!next) return;
        await writeTextFile(file, `${JSON.stringify(next, null, 2)}\n`, raw);
        return;
      } catch {}
    }
  }

  async command(command, cx) {
    if (command === "focus") {
      this.handle.focus();
      this.helpOpen = false;
      this.legendId = null;
      this.legendFrom = null;
      const first = this.shown()[0];
      if (!this.sel && first && tokensOf(shared(QUERY_KEY)).length) this.select(first.id);
    } else if (command === "toggle") {
      if (this.handle.is_focused()) this.backToPane();
      else this.handle.focus();
    } else if (command === "font_in" || command === "font_out" || command === "font_reset") {
      await this.changeFont(command);
    } else if (command === "back" || command === "forward") {
      this.navigate(command === "back" ? -1 : 1);
    } else if (command === "legend") {
      this.openLegend();
    } else if (command === "legend_closed") {
      if (!this.helpOpen && !this.legendId) return;
      this.helpOpen = false;
      this.legendId = null;
      if (this.legendFrom) this.returnFromLegend();
      else this.handle.focus();
    } else if (command === "retry") {
      this.retry(cx);
    } else if (command === "next" || command === "prev") {
      const id = cycle(this.shown(), this.sel, command === "next" ? 1 : -1);
      if (id) this.select(id);
    } else if (command === "clear") {
      this.select(null);
    } else if (command === "first" || command === "last" || command === "pages" || command === "oldest_page"
      || command === "read" || command === "undo" || command === "ask" || command === "result"
      || command === "expand" || command === "collapse" || command === "menu" || command === "filter") {
      this.act(command, cx);
    }
  }

  closeLegend() {
    closeOverlay(this.legendId);
    this.legendId = null;
    this.helpOpen = false;
    this.returnFromLegend();
  }

  returnFromLegend() {
    const from = this.legendFrom;
    this.legendFrom = null;
    if (from) run("pane.focus", from);
    else this.handle.focus();
  }

  openLegend() {
    if (this.helpOpen) {
      this.closeLegend();
      return;
    }
    this.helpOpen = true;
    this.menu = null;
    this.legendFrom = this.handle.is_focused() ? null : paneTarget(focused());
    this.legendId = openOverlay({ mod: "night-city-street", kind: "dialog", frame: "none", width: LEGEND.width, height: LEGEND.height, props: { role: "legend", lang: this.lang } });
  }

  legendClose() {
    run("night-city-street.legend_closed");
    closeOverlay(props()?.overlay);
  }

  backToPane() {
    const target = paneTarget(focused());
    if (target) run("pane.focus", target);
    else run("pane.go", { direction: "down" });
  }

  async close(_cx) {
    if (this.role === "legend") run("night-city-street.legend_closed");
  }

  key(event, cx) {
    const mod = event.modifiers ?? {};
    const key = event.key;
    if (key === "p" && mod.control && mod.alt && !mod.platform) {
      this.backToPane();
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (mod.platform && !mod.control && !mod.alt) {
      if (key === "enter" && !mod.shift) this.act("menu", cx);
      else if (key === "z" && !mod.shift && this.last) this.undoLast();
      else return;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (mod.platform || mod.control || (mod.alt && !(key === "left" || key === "right"))) return;
    const order = this.shown();
    const picked = this.items.find((item) => item.id === this.sel) ?? null;
    const menu = this.openMenuFor();
    if (menu) {
      if (key === "escape") this.menu = null;
      else if (key === "down" && menu.rows.length) menu.at = (menu.at + 1) % menu.rows.length;
      else if (key === "up" && menu.rows.length) menu.at = (menu.at - 1 + menu.rows.length) % menu.rows.length;
      else if (key === "enter") {
        const row = menu.rows[menu.at];
        this.menu = null;
        row?.run(cx);
      }
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (mod.alt) {
      if (key === "left") this.act("first", cx);
      else if (key === "right") this.act("last", cx);
      else return;
    } else if (key === "tab" || key === "right" || key === "left") {
      this.stepSelection(key === "left" || (key === "tab" && mod.shift) ? -1 : 1);
    } else if (key === "enter" && mod.shift) {
      this.act("pages", cx);
    } else if (key === "enter") {
      if (picked) this.goTo(picked, cx);
      else if (order[0]) this.select(order[0].id);
    } else if (key === "escape") {
      if (this.sel) this.select(null);
      else if (this.filter) this.setFilter(null);
      else if (tokensOf(shared(QUERY_KEY)).length) run("night-city-tabs.clear");
      else this.backToPane();
    } else if (key === "?" || (key === "/" && mod.shift)) {
      this.openLegend();
    } else if (key === "/") {
      run("night-city-tabs.search");
    } else if (key === "m" || key === "backspace") {
      this.act("read", cx);
    } else if (key === "space") {
      this.act(mod.shift ? "result" : "ask", cx);
    } else if (key === "down") {
      this.act("expand", cx);
    } else if (key === "up") {
      this.act("collapse", cx);
    } else if (key === "p") {
      this.act("oldest_page", cx);
    } else if (key === "f") {
      this.act("filter", cx);
    } else {
      return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    if (this.role === "legend") return this.legend();
    const now = Date.now();
    const t = words(this.lang);
    const tokens = tokensOf(shared(QUERY_KEY));
    const picked = this.items.find((item) => item.id === this.sel) ?? null;
    const here = this.here;
    const blocks = this.blocks;
    const { streetH, sw: SW, sh: SH, top: CAM_TOP } = this.geom;
    // Demo keeps the street-mode look under a selection the keyboard has left, so the picture shows a lit street behind the flyer.
    const street = !!this.keyboard || (this.demo && Boolean(this.sel));
    const tx = camLeft(this.cam.x1, this.width, blocks, this.scale);
    // Asking bubbles are placed across the strip, not per building: one that would touch a
    // higher-priority one is not drawn. The selected session's ask is in its flyer, and its box
    // still outranks the rest, so it is never the one dropped.
    const asks = this.items
      .filter((item) => item.status === "needs" && item.ask && this.visible(item, tokens))
      .map((item) => {
        const walker = this.walkers.get(item.id);
        if (!walker) return null;
        return { id: item.id, x: walker.leg.x1 * this.scale + tx, w: bubbleBox(item.ask, this.scale).w, selected: item.id === this.sel || item.id === here };
      })
      .filter(Boolean);
    const unasked = new Set(bubblesHidden(asks, this.width / 2));

    const homes = Array.from({ length: BUILDINGS * blocks }, (_, i) => {
      const here = this.items.filter((item) => item.home === i);
      const awake = !this.items.length || here.some((item) => item.status !== "idle");
      return {
        lit: street ? 1 : picked ? (picked.home === i ? 1 : awake ? 0.35 : 0.05) : awake ? 1 : 0.08,
        steam: awake,
        urgent: here.some((item) => item.status === "needs"),
        flag: here.some((item) => item.status === "done"),
      };
    });
    const dim = (id, w) => div().id(id).absolute().left(0).top(0).w(w).h(SH).bg("#06040f").opacity(picked ? (street ? PICK_DIM_STREET : 0.5) : street ? 0 : AWAY_DIM).transition("opacity", { duration: 600 });
    const skyW = Math.max(this.width, SW);
    const sky = div().absolute().left(0).top(CAM_TOP).w(skyW).h(SH)
      .children(skyNodes({ viewW: this.width, plane: this.plane.go, scale: this.scale }))
      .child(dim("ncd-dim-sky", skyW));

    const layers = [];
    for (let b = 0; b < blocks; b++) layers.push(...blockNodes({ block: b, homes: homes.slice(b * BUILDINGS, b * BUILDINGS + BUILDINGS), alarm: picked?.status === "needs", on: street, scale: this.scale }));
    const cam = div().id("ncd-cam").absolute().left(r2(tx)).top(CAM_TOP).w(blocks * SW).h(SH)
      .transition("left", { duration: Number.isFinite(this.cam.dur) ? Math.round(this.cam.dur) : 0, easing: "ease-in-out" })
      .children(layers)
      .child(dim("ncd-dim", blocks * SW))
      .children(this.crowd.map((walker) => walkerNode(walker, { opacity: 0.55, scale: this.scale })));
    for (const item of drawOrder(this.items)) {
      const walker = this.walkers.get(item.id);
      if (!walker) continue;
      const hit = this.visible(item, tokens);
      const selected = item.id === this.sel;
      const base = item.status === "idle" && !selected ? 0.6 : 1;
      cam.child(walkerNode(walker, {
        opacity: selected ? 1 : base * (picked ? 0.5 : 1) * (hit ? 1 : 0.25),
        selected, here: item.id === here, tint: item.tint, scale: this.scale,
        ask: item.status === "needs" && !selected && hit && !unasked.has(item.id) ? item.ask : null,
        tip: `${item.name} · ${t[item.status]}`,
        onClick: (event, cx) => {
          cx.stop_propagation();
          this.handle.focus();
          if (event.click_count === 2) { this.select(item.id); this.goTo(item, cx); }
          else this.select(selected ? null : item.id);
          cx.notify();
        },
        onRightClick: (event, cx) => {
          cx.stop_propagation();
          this.handle.focus();
          this.select(item.id);
          this.openMenu(item);
          cx.notify();
        },
      }));
    }

    const fade = (left, from, to) => div().absolute().left(left).top(0).w(86).h(streetH).child(gradient(from, to, 90));
    const streetView = div().id("ncd-street").relative().flex_none().w_full().h(streetH).overflow_hidden().bg(C.night)
      .on_click((_event, cx) => { this.handle.focus(); this.select(null); cx.notify(); })
      .child(sky)
      .child(cam)
      .child(fade(0, C.night, `${C.night}00`))
      .child(fade(Math.max(0, this.width - 86), `${C.night}00`, C.night));

    const tabAction = (delta) => (_event, cx) => {
      if (this.openMenuFor()) return;
      this.stepSelection(delta);
      cx.notify();
    };
    return div().id("ncd-root").track_focus(this.handle).key_context("NightCityStreet").relative().size_full().flex().flex_col().bg(C.night)
      .on_action("ncd_street_next", tabAction(1))
      .on_action("ncd_street_prev", tabAction(-1))
      .on_key_down((event, cx) => this.key(event, cx))
      .on_size_change((size, cx) => {
        const wider = Math.abs(size.width - this.width) >= 1;
        const taller = Math.abs(size.height - this.blockH) >= 1;
        if (!wider && !taller) return;
        this.width = size.width;
        this.blockH = size.height;
        this.geom = geomFor(size.height);
        this.scale = this.geom.scale;
        const now = Date.now();
        this.updateBlocks(this.items, now);
        this.snapCamera(now);
        this.retape(now);
        cx.notify();
      })
      .child(streetView)
      .child(this.ticker(t, tokens))
      .child(this.flyerNode(t, now, tx));
  }

  ticker(t, tokens) {
    const counts = countsOf(this.items);
    const scrolling = this.tape.width > this.runWidth();
    const cell = (c, copy) => div().id(`ncd-tape-${copy}-${c.id}`).flex().flex_row().flex_none().items_center().h(TICKER_H).w(c.w).cursor_pointer()
      .on_click((_event, cx) => { this.handle.focus(); this.select(c.id); cx.notify(); })
      .child(dot(tintOf(c.tint), 7))
      .child(div().flex_none().ml(10).w(c.wn).text_size(13).font_weight(700).text_color(c.id === this.sel ? tintOf(c.tint) : C.white).whitespace_nowrap().overflow_hidden().child(c.name))
      .when(c.wt, (el) => el.child(div().flex_none().ml(10).w(c.wt).text_size(13).text_color(C.ink2).whitespace_nowrap().overflow_hidden().child(c.text)));
    const cells = this.tape.cells.map((c) => cell(c, 0));
    if (scrolling) cells.push(...this.tape.cells.map((c) => cell(c, 1)));
    const empty = !this.tape.cells.length;
    const tape = div().id("ncd-tape").absolute().left(r2(24 + this.run.x1)).top(0).h(TICKER_H).flex().flex_row().items_center()
      .transition("left", { duration: this.run.walk ? Math.round(this.run.dur) : 0, easing: "linear" })
      .children(cells)
      .when(empty, (el) => el.child(div().text_size(13).text_color(C.ink3).whitespace_nowrap().child(tokens.length || this.filter ? t.noMatch : t.quiet)));
    const active = (name) => this.filter === name;
    const count = (name, label, n, color) => div().id(`ncd-count-${name}`).flex().flex_row().flex_none().items_center().gap(5).px(6).h(24)
      .rounded(7).cursor_pointer()
      .when(active(name), (el) => el.bg("#ffffff10"))
      .on_click((_event, cx) => { this.handle.focus(); this.setFilter(active(name) && this.filter === name ? null : name); cx.notify(); })
      .child(div().text_size(12).text_color(this.filter ? C.ink2 : C.ink3).child(label))
      .child(div().text_size(12).font_weight(700).text_color(color).child(String(n)));
    const chip = this.filter && this.filter !== "needs" && this.filter !== "working" && this.filter !== "done"
      ? div().id("ncd-filter-chip").flex().flex_row().flex_none().items_center().gap(6).px(9).h(22).rounded(11)
        .border(1).border_color(`${C.mustard}66`).cursor_pointer().tooltip(t.filters.all)
        .on_click((_event, cx) => { this.handle.focus(); this.setFilter(null); cx.notify(); })
        .child(dot(C.mustard, 6))
        .child(div().text_size(11.5).font_weight(600).text_color(C.mustard).child(t.filters[this.filter]))
      : null;
    return div().flex().flex_row().flex_none().w_full().h(TICKER_H).bg(C.bar).border_t(1).border_b(1)
      .border_color(this.handle.is_focused() ? `${C.mustard}66` : C.line)
      .child(div().flex().flex_none().items_center().justify_center().w(LABEL_W).h_full().bg("#120d22").border_r(1).border_color(C.line)
        .child(image(`${UI_ART}signs/tonight.svg`).w(85).h(31)))
      .child(div().id("ncd-run").relative().flex_1().h_full().overflow_hidden()
        .on_hover((hovered, cx) => { this.hoverTape(hovered); cx.notify(); })
        .child(tape)
        .child(div().absolute().left(0).top(0).w(36).h_full().child(gradient(C.bar, `${C.bar}00`, 90)))
        .child(div().absolute().right(0).top(0).w(36).h_full().child(gradient(`${C.bar}00`, C.bar, 90))))
      .child(div().flex().flex_row().flex_none().items_center().gap(10).px(16).h_full().border_l(1).border_color(C.line)
        .when(Boolean(chip), (el) => el.child(chip))
        .child(count("needs", t.countNeeds, counts.needs, C.pink))
        .child(count("working", t.countWorking, counts.working, C.ink))
        .child(count("done", t.countDone, counts.done, C.mustard)));
  }

  // The card beside the selected walker. It stays in the tree (faded out) so it can fade and slide in.
  flyerNode(t, now, tx) {
    const item = this.items.find((candidate) => candidate.id === this.flyer) ?? null;
    const shown = Boolean(item) && item.id === this.sel && !this.helpOpen;
    const walker = item ? this.walkers.get(item.id) : null;
    const x = walker ? (item.id === this.sel ? legX(walker.leg, now) : standX(walker.status, walker.home, walker.slot)) * this.scale + tx : this.width / 2;
    // A short block lifts the card and takes optional rows off it, rather than let the ticker cut it.
    const fit = item ? this.fitOf(item) : null;
    const top = fit ? fit.top : FLYER.top;
    const card = div().id("ncd-flyer").absolute().left(r2(flyerLeft(x, this.width, Boolean(shared(ACCOUNTS_KEY)?.overlay)))).top(shown ? top : top + 14).w(FLYER_W)
      .opacity(shown ? 1 : 0)
      .transition("opacity", { duration: 300 })
      .transition("top", { duration: 420, easing: "ease-out" })
      .transition("left", { duration: 700, easing: "ease-in-out" });
    if (!item) return card;
    const tint = tintOf(item.tint);
    const button = (id, label, key, primary, act) => {
      const el = div().id(id).flex().flex_row().flex_none().items_center().gap(6).h(30).px(12).rounded(8).border(1)
        .text_size(12.5).font_weight(600)
        .bg(primary ? tint : "#ffffff0d").border_color(primary ? tint : C.line2).text_color(primary ? "#1a0f22" : C.ink)
        .child(label)
        .child(div().px(4).h(16).flex().items_center().rounded(4).bg("#00000022").text_size(10.5).font_family(MONO).child(key));
      return shown ? el.cursor_pointer().hover((s) => s.opacity(0.85)).on_click((_event, cx) => { cx.stop_propagation(); act(cx); cx.notify(); }) : el;
    };
    const body = div().relative().flex().flex_col().px(FLYER.padX).pt(FLYER.padTop).pb(FLYER.padBottom)
      .child(div().flex().flex_row().items_center().gap(12)
        .child(portrait(item.who, item.status, FLYER.portrait, item.tint))
        .child(div().flex().flex_col().flex_1().overflow_hidden()
          .child(div().h(FLYER.statusH).line_height(`${FLYER.statusH}px`).text_size(11).font_weight(600).text_color(tint).child([t[item.status], ago(item.since, now, this.lang)].filter(Boolean).join(" · ")))
          .child(div().mt(FLYER.nameMt).h(FLYER.nameH).line_height(`${FLYER.nameH}px`).text_size(16).font_weight(700).text_color(C.white).truncate().child(item.name))
          .child(div().mt(FLYER.metaMt).h(FLYER.metaH).line_height(`${FLYER.metaH}px`).text_size(11.5).font_family(MONO).text_color(C.ink3).truncate().child([item.ticket ?? item.place, item.agent].filter(Boolean).join(" · ")))));
    const checkline = item.check && fit.check
      ? div().mt(FLYER.checkMt).flex().flex_row().flex_none().items_center().justify_between().gap(10)
        .child(div().flex_1().h(FLYER.checkH).line_height(`${FLYER.checkH}px`).text_size(12).text_color(C.ink2).truncate().child(`${t.checklist} ${item.check.done}/${item.check.total}${item.check.now ? ` · ${item.check.now}` : ""}`))
        .child(segs(item.check.done / item.check.total, Math.min(12, item.check.total), "cyan"))
      : null;
    const expanded = fit.expanded;
    const menu = this.openMenuFor();
    if (menu && menu.id === item.id) {
      const rows = menu.rows.length ? menu.rows : [{ id: "empty", label: t.menuEmpty, run: () => {} }];
      body.child(div().mt(12).flex().flex_col().gap(3)
        .child(div().text_size(11).font_weight(700).text_color(C.ink3).child(t.menuTitle))
        .children(rows.map((row, index) => div().id(`ncd-menu-${row.id}`).flex().flex_row().flex_none().items_center().gap(8).h(28).px(9).rounded(8)
          .when(index === menu.at, (el) => el.bg(`${tint}22`).border(1).border_color(`${tint}55`))
          .child(dot(index === menu.at ? tint : C.ink3, 5))
          .child(div().flex_1().text_size(12.5).text_color(index === menu.at ? C.white : C.ink).truncate().child(row.label))
          .when(index === menu.at, (el) => el.child(div().px(4).h(16).flex().items_center().rounded(4).bg("#00000022").text_size(10.5).font_family(MONO).child("↩"))))));
    } else if (expanded) {
      if (checkline) body.child(checkline);
      body.child(this.stepsBlock(item, t, tint, fit.stepRows));
    } else {
      if (item.ask) {
        body.child(div().id("ncd-flyer-ask").mt(FLYER.askMt).px(FLYER.askPadX).py(FLYER.askPadY).h(askBoxHeight(item.ask, fit.askLines)).overflow_hidden().rounded(10).bg(`${tint}14`).border(1).border_color(`${tint}44`)
          .text_size(FLYER.askSize).font_weight(600).line_height(`${FLYER.askLineH}px`).text_color("#ffe6f0").child(clipText(item.ask, FLYER.askClip, FLYER.askSize, true)));
      }
      const about = item.topic ?? item.line;
      if (about && fit.about) body.child(div().mt(FLYER.aboutMt).max_h(FLYER.aboutH).overflow_hidden().text_size(13).line_height("19.5px").text_color(C.ink2).child(clipText(about, 560, 13)));
      if (checkline) body.child(checkline);
      if (item.pages.length && fit.pages) {
        const pages = div().id("ncd-flyer-pages").mt(FLYER.pagesMt).h(FLYER.pagesH).flex().flex_row().items_center().gap(7).text_size(12).text_color(C.ink2)
          .child(svg(icon("mail")).size(14).flex_none().text_color(C.mustard))
          .child(t.pages(item.pages.length))
          .child(kbd(t.pageHint));
        body.child(shown ? pages.cursor_pointer().hover((s) => s.text_color(C.white)).on_click((_event, cx) => { cx.stop_propagation(); this.openPages(item, cx); }) : pages);
      }
      body.child(div().mt(FLYER.buttonsMt).h(FLYER.buttonsH).flex().flex_row().gap(8)
        .child(button("ncd-flyer-go", item.status === "needs" ? t.answer : t.open, "↩", true, (cx) => this.goTo(item, cx)))
        .child(item.status === "done"
          ? button("ncd-flyer-read", t.read, "M", false, () => this.markRead(item))
          : button("ncd-flyer-next", t.next, "⇥", false, () => { const id = cycle(this.shown(), this.sel); if (id) this.select(id); })));
    }
    const inner = div().relative().w_full().rounded(14).border(1).border_color(C.line2).bg(C.card).overflow_hidden()
      .child(gradient("#1d1838", "#120e25", 160))
      .child(body);
    card.child(div().w_full().rounded(15).border(1).border_color(`${tint}55`).shadow_2xl().child(inner));
    return shown ? card.on_mouse_down("left", stop).on_click(stop) : card;
  }

  stepsBlock(item, t, tint, limit = STEP_ROWS) {
    const { top, rows } = this.stepsShown(item);
    const drawn = rows.slice(0, Math.max(0, limit));
    return div().mt(FLYER.stepsMt).flex().flex_col().gap(FLYER.stepGap)
      .child(div().flex().flex_row().flex_none().items_center().justify_between().gap(8).h(FLYER.stepsTitleH)
        .child(div().text_size(11).font_weight(700).text_color(C.ink3).child(t.stepsTitle))
        .child(div().text_size(10.5).font_family(MONO).text_color(C.ink3).child(t.stepsCount(top + 1, top + drawn.length, item.steps.length))))
      .children(drawn.map((step) => div().flex().flex_row().flex_none().items_center().gap(7).h(FLYER.stepRowH)
        .child(dot({ done: C.ink3, now: tint, blocked: C.pink, side: C.violet, left: C.ink3 }[step.state] ?? C.ink3, 6))
        .child(div().flex_1().text_size(11.5).truncate().text_color(step.state === "done" ? C.ink3 : step.state === "now" ? tint : C.ink2)
          .child(clipText(step.label, 250, 11.5)))));
  }

  legendKey(event, cx) {
    const mod = event.modifiers ?? {};
    if (event.key !== "escape" && event.key !== "?" && !(event.key === "/" && mod.shift)) return;
    this.legendClose();
    cx.stop_propagation();
    cx.notify();
  }

  legend() {
    const t = words(this.lang);
    const row = ([key, text]) => div().flex().flex_row().flex_none().items_center().gap(10).w(LEGEND.colW).h(LEGEND.rowH)
      .child(div().flex().flex_row().flex_none().w(LEGEND.keyW).justify_end().child(kbd(key)))
      .child(div().flex_none().w(LEGEND.textW).text_size(13).text_color(C.ink2).whitespace_nowrap().child(text));
    const group = (g) => div().flex().flex_col().flex_none().gap(LEGEND.rowGap).mb(LEGEND.groupMb)
      .child(div().h(LEGEND.titleH).line_height(`${LEGEND.titleH}px`).text_size(11).font_weight(700).text_color(C.ink3).child(g.title))
      .children(g.rows.map(row));
    const columns = LEGEND.columns.map((indexes) => div().flex().flex_col().flex_none().w(LEGEND.colW)
      .children(indexes.map((index) => group(t.keyGroups[index]))));
    return div().id("ncd-legend").relative().size_full().rounded(14).border(LEGEND.border).border_color(C.line2).bg(C.card).overflow_hidden()
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.legendKey(event, cx))
      .on_click(() => this.legendClose())
      .child(gradient("#1b1634", "#110d22", 160))
      .child(div().relative().flex().flex_col().px(LEGEND.padX).py(LEGEND.padY)
        .child(div().flex().flex_row().items_end().gap(LEGEND.noteGap).h(LEGEND.headerH)
          .child(image(`${UI_ART}signs/night-keys.svg`).flex_none().w(LEGEND.signW).h(LEGEND.headerH))
          .child(div().flex_none().text_size(12).text_color(C.ink3).whitespace_nowrap().child(t.keyNote)))
        .child(div().mt(LEGEND.headerMt).flex().flex_row().gap(LEGEND.colGap).children(columns)));
  }
}
