import { View, div, image, svg } from "gpui-kit";
import { appHome, closeOverlay, exec, focused, nextCommand, openOverlay, panes, props, run, setShared, settings, shared, spaces, terminals } from "herdr";
import { ACCOUNTS_KEY, C, SHARED_KEY, UI_ART, clipText, dot, faceOf, icon, segs, textWidth, words } from "./neon.js";
import { demoCast, demoGroups, demoLang, demoMatch, demoUsage } from "./demo.js";

const REFRESH_MS = 30000;
const MAX_ACCOUNTS = 4;
const LABEL_CHARS = 18;
const TICKET = /(?:^|[^A-Za-z0-9])((?:cas|imio|ieis)-\d{1,5})(?![0-9])/i;
const ACCOUNTS_W = 460;
const ACCOUNTS_H = 700;
const PLATES_H = 48;
const PLATES_PAD = 16;
const ACCOUNTS_GAP = 6;

function cwdOf(terminal) {
  return terminal?.foreground?.cwd || terminal?.cwd || null;
}

export function pidText(pid) {
  if (Number.isInteger(pid) && pid > 0) return String(pid);
  if (typeof pid === "string" && /^\d+$/.test(pid)) return pid;
  return null;
}

export function spaceTicket(name) {
  const match = String(name ?? "").match(TICKET);
  return match ? match[1].toUpperCase() : null;
}

export function spaceLabel(space, cast) {
  const mine = (cast ?? []).filter((entry) => entry.space === space.id);
  const ticket = mine.find((entry) => entry.ticket)?.ticket;
  if (ticket) return ticket;
  const key = spaceTicket(space.name);
  if (key) return key;
  const name = String(space.name ?? "");
  // No measuring API: an 18-character budget is the estimated width of its first 18 characters.
  return clipText(name, textWidth(name.slice(0, LABEL_CHARS), 12), 12);
}

// cca prints "used" as a percentage (cca:150 prints it with %.0f and cca:202-212 adds "%"),
// so divide by 100 to feed the kit's 0..1 meters.
function percent(value) {
  const text = String(value ?? "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const used = Number(text) / 100;
  return Math.max(0, Math.min(1, used));
}

export function parseUsage(text) {
  const out = { current: "default", claudeDefault: "default", codexActive: "default", accounts: [], codex: [] };
  const claude = new Map();
  const codex = new Map();
  const labels = new Map();
  const claudeEntry = (name) => {
    let entry = claude.get(name);
    if (!entry) {
      entry = { name, label: null, email: null, five: null, week: null, fable: null };
      claude.set(name, entry);
      out.accounts.push(entry);
    }
    return entry;
  };
  const codexEntry = (name) => {
    let entry = codex.get(name);
    if (!entry) {
      entry = { name, label: null, email: null, five: null, week: null, fable: null };
      codex.set(name, entry);
      out.codex.push(entry);
    }
    return entry;
  };
  for (const line of String(text ?? "").split("\n")) {
    if (!line) continue;
    const fields = line.split("\t");
    const kind = fields[0];
    const name = fields[1];
    if (!name) continue;
    if (kind === "C") out.current = name;
    else if (kind === "D") out.claudeDefault = name;
    else if (kind === "A") claudeEntry(name).email = (fields[2] ?? "").trim();
    else if (kind === "L" && (fields[2] ?? "").trim()) labels.set(name, fields[2].trim());
    else if (kind === "U") {
      const entry = claudeEntry(name);
      entry.five = percent(fields[2]);
      entry.week = percent(fields[4]);
      entry.fable = percent(fields[6]);
    } else if (kind === "Y") out.codexActive = name;
    else if (kind === "X") codexEntry(name).email = (fields[2] ?? "").trim();
    else if (kind === "V") {
      const entry = codexEntry(name);
      entry.five = percent(fields[2]);
      entry.week = percent(fields[4]);
    }
  }
  for (const entry of out.accounts) entry.label = labels.get(entry.name) ?? null;
  for (const entry of out.codex) entry.label = labels.get(`codex:${entry.name}`) ?? null;
  return out;
}

function groupName(repo) {
  if (!repo?.common) return null;
  const top = repo.common.replace(/[\\/]\.git[\\/]?$/, "");
  return top.split(/[\\/]/).filter(Boolean).pop() ?? null;
}

export function wantedOrder(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.repo?.common ?? `space:${row.space.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].flatMap((members) => [
    ...members.filter((row) => row.repo?.base),
    ...members.filter((row) => !row.repo?.base),
  ]).map((row) => row.space.id);
}

export function groupSpaces(rows) {
  const byId = new Map(rows.map((row) => [row.space.id, row]));
  const groups = [];
  const byKey = new Map();
  for (const id of wantedOrder(rows)) {
    const row = byId.get(id);
    const key = row.repo?.common ?? `space:${id}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, name: groupName(row.repo), spaces: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.spaces.push(row.space);
  }
  return groups;
}

const hasUsage = (entry) => entry.five != null || entry.week != null;

function zoomOf(value) {
  const zoom = Number(value?.zoom);
  return zoom > 0 ? zoom : 1;
}

/** Where the accounts popup sits: right edge on the meter's, bottom edge just above the plates. */
export function accountsAt(viewport, zoom = 1) {
  if (!viewport || !(viewport.width > 0) || !(viewport.height > 0)) return undefined;
  const x = Math.max(0, viewport.width - PLATES_PAD * zoom - ACCOUNTS_W * zoom);
  const y = Math.max(0, viewport.height - PLATES_H * zoom - ACCOUNTS_GAP * zoom - ACCOUNTS_H * zoom);
  return { x: Math.round(x), y: Math.round(y) };
}

/** The next id in drawn order, wrapping; an id that left the plates starts at the first. */
export function stepCursor(ids, id, delta) {
  if (!ids.length) return null;
  const at = ids.indexOf(id);
  if (at < 0) return ids[0];
  return ids[(at + delta + ids.length) % ids.length];
}

export default class NightCityPlates extends View {
  init(_props, cx) {
    this.demo = (props() ?? {}).demo === true;
    // A crash can leave the popup id behind; without this the first key press would only clear it.
    if (!this.demo && shared(ACCOUNTS_KEY) != null) setShared(ACCOUNTS_KEY, null);
    this.fire = (name, args) => { if (!this.demo) { if (args === undefined) run(name); else run(name, args); } };
    this.handle = cx.focus_handle();
    // Herdr does not redraw this mod when the keyboard moves to another mod, so the cursor ring needs its own watch.
    this.focusShown = false;
    cx.timer.every(250, (later) => {
      const now = this.handle.is_focused();
      if (now === this.focusShown) return;
      this.focusShown = now;
      later.notify();
    });
    this.cursor = null;
    this.repos = null;
    this.usage = this.demo ? demoUsage() : null;
    this.readingRepos = false;
    this.lastMove = null;
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        this.command(command);
        cx.notify();
      }
    });
    if (this.demo) {
      // The staged picture runs in its own preview home, where a value left by the last window would make the toggle close.
      if ((props() ?? {}).openAccounts === true) {
        if (shared(ACCOUNTS_KEY) != null) setShared(ACCOUNTS_KEY, null);
        cx.timer.after(60, () => this.toggleAccounts());
      }
      return;
    }
    this.readRepos(cx);
    this.readUsage(cx);
    cx.timer.every(REFRESH_MS, (later) => this.readRepos(later));
    cx.timer.every(REFRESH_MS, (later) => this.readUsage(later));
  }

  command(command) {
    if (command === "focus") {
      this.handle.focus();
      this.ensureCursor(this.plateList(this.groupsNow()));
    } else if (command === "left" || command === "right") {
      this.stepCursor(command === "left" ? -1 : 1);
    } else if (command === "select") {
      this.selectCursor();
    } else if (command === "accounts") {
      this.toggleAccounts();
    }
  }

  groupsNow() {
    return this.demo ? demoGroups() : groupSpaces(this.rows());
  }

  plateList(groups) {
    return groups.flatMap((group) => group.spaces);
  }

  ensureCursor(plates) {
    if (this.cursor && plates.some((space) => space.id === this.cursor)) return this.cursor;
    const start = plates.find((space) => space.active) ?? plates[0];
    this.cursor = start ? start.id : null;
    return this.cursor;
  }

  stepCursor(delta) {
    const plates = this.plateList(this.groupsNow());
    const next = stepCursor(plates.map((space) => space.id), this.ensureCursor(plates), delta);
    if (next) this.cursor = next;
  }

  selectCursor() {
    const id = this.ensureCursor(this.plateList(this.groupsNow()));
    if (id) this.fire("space.select", { id });
  }

  toggleAccounts() {
    const open = shared(ACCOUNTS_KEY)?.overlay;
    if (open) {
      closeOverlay(open);
      setShared(ACCOUNTS_KEY, null);
      return;
    }
    openOverlay({
      mod: "night-city-accounts", kind: "popup", width: ACCOUNTS_W, height: ACCOUNTS_H,
      ...(this.accountsSpot ? { at: this.accountsSpot } : {}),
      ...(this.demo ? { props: { demo: true } } : {}),
    });
  }

  key(event, cx) {
    const mod = event.modifiers ?? {};
    const plates = this.plateList(this.groupsNow());
    const id = this.ensureCursor(plates);
    const plain = !mod.platform && !mod.control && !mod.alt;
    if (event.key === "p" && mod.control && mod.alt && !mod.platform) {
      // The keys.json binding alone does not hand the keyboard back from a focused plate row.
      this.fire("pane.go", { direction: "up" });
    } else if (event.key === "escape") {
      this.fire("pane.go", { direction: "up" });
    } else if (event.key === "left") {
      this.stepCursor(-1);
    } else if (event.key === "right") {
      this.stepCursor(1);
    } else if (event.key === "enter" || event.key === "space") {
      if (id) this.fire("space.select", { id });
    } else if (plain && event.key === "a") {
      this.toggleAccounts();
    } else if (plain && event.key === "n") {
      this.fire("space.new");
    } else if (plain && event.key === "m" && id && !this.demo) {
      openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id } } });
    } else {
      return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  rows() {
    const paneList = panes();
    const byAddress = new Map(terminals().map((terminal) => [terminal.address, terminal]));
    return spaces().map((space) => {
      const tabs = new Set(space.tabs.map((tab) => tab.id));
      const pane = paneList.find((candidate) => candidate.terminal && tabs.has(candidate.tab));
      const cwd = pane ? cwdOf(byAddress.get(pane.terminal)) : null;
      const repo = this.repos === null ? undefined : cwd ? this.repos[cwd] ?? null : null;
      return { space, repo };
    });
  }

  readRepos(cx) {
    if (this.readingRepos) return;
    const folders = [...new Set(terminals().map(cwdOf).filter(Boolean))];
    if (!folders.length) {
      this.repos = {};
      return;
    }
    this.readingRepos = true;
    cx.spawn(async (cx) => {
      const next = {};
      for (const cwd of folders) {
        try {
          const r = await exec("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"]);
          const [common, top] = String(r.stdout ?? "").trim().split("\n");
          next[cwd] = r.code === 0 && common ? { common, base: Boolean(top) && `${top}/.git` === common } : null;
        } catch {
          next[cwd] = null;
        }
      }
      this.repos = next;
      this.readingRepos = false;
      this.groupSpaces();
      cx.notify();
    });
  }

  // Keeps the spaces of one repository next to each other in Herdr's order (base checkout
  // first); each wanted order is tried once so a refused move is not retried forever.
  groupSpaces() {
    const rows = this.rows();
    if (rows.some((row) => row.repo === undefined)) return;
    const want = wantedOrder(rows);
    const have = rows.map((row) => row.space.id);
    const key = `${have.join(",")}>${want.join(",")}`;
    if (want.join(",") === have.join(",") || this.lastMove === key) return;
    this.lastMove = key;
    const order = [...have];
    want.forEach((id, index) => {
      if (order[index] === id) return;
      run("space.move", { id, index: index + 1 });
      order.splice(order.indexOf(id), 1);
      order.splice(index, 0, id);
    });
  }

  focusedPid() {
    const here = focused();
    if (!here?.terminal) return null;
    const terminal = terminals().find((candidate) => candidate.address === here.terminal);
    return pidText(terminal?.foreground?.pid);
  }

  readUsage(cx) {
    const pid = this.focusedPid();
    cx.spawn(async (cx) => {
      let text = "";
      try {
        const r = await exec("sh", [`${appHome()}/mods/night-city-accounts/cca`, "--porcelain", ...(pid ? [pid] : [])]);
        text = String(r?.stdout ?? "");
      } catch {}
      this.usage = text ? parseUsage(text) : null;
      cx.notify();
    });
  }

  meterBlocks() {
    const usage = this.usage;
    if (!usage) return [];
    const claude = usage.accounts.filter(hasUsage).slice(0, MAX_ACCOUNTS)
      .map((entry) => ({ ...entry, on: entry.name === usage.claudeDefault }));
    const room = MAX_ACCOUNTS - claude.length;
    const codex = room > 0
      ? usage.codex.filter(hasUsage).slice(0, room).map((entry) => ({ ...entry, on: entry.name === usage.codexActive }))
      : [];
    return [...claude, ...codex];
  }

  accountBlock(account) {
    return div().flex_none().flex().flex_row().items_center().gap(8)
      .child(div().flex_none().text_size(12).font_weight(600).text_color(account.on ? C.mustard : C.ink2)
        .child(account.label ?? account.name))
      .child(div().flex().flex_col().gap(2)
        .when(account.five != null, (el) => el.child(segs(account.five, 8, "cyan")))
        .child(segs(account.week, 8, "mustard"))
        .when(account.fable != null, (el) => el.child(segs(account.fable, 8, "pink"))));
  }

  render() {
    try { this.accountsSpot = accountsAt(window.viewport_size(), zoomOf(settings())); } catch { }
    const state = this.demo ? {} : shared(SHARED_KEY) ?? {};
    const open = this.demo ? shared(SHARED_KEY)?.demoOpen : null;
    const lang = this.demo ? demoLang : state.lang ?? "en";
    const cast = this.demo ? demoCast() : Array.isArray(state.cast) ? state.cast : [];
    const groups = this.groupsNow();
    this.ensureCursor(this.plateList(groups));
    const matched = open
      ? new Set(this.plateList(groups).filter((space) => demoMatch(space.name, open.name)).map((space) => space.id))
      : new Set();

    const plate = (space) => {
      const mine = cast.filter((entry) => entry.space === space.id);
      const active = matched.size ? matched.has(space.id) : Boolean(space.active);
      const cursor = this.handle.is_focused() && this.cursor === space.id;
      const border = active ? C.mustard : mine.some((entry) => entry.status === "needs") ? C.pink : C.line;
      const tip = [space.name, ...mine.map((entry) => `${entry.name} · ${words(lang)[entry.status] ?? entry.status}`)]
        .filter(Boolean).join("\n");
      return div().id(`nc-space-${space.id}`).relative().flex_none().flex().items_center().gap(6).h(26).px(9).rounded(13)
        .border(1).border_color(border).text_size(12).text_color(active ? C.white : C.ink2).cursor_pointer()
        .when(Boolean(tip), (el) => el.tooltip(tip))
        .on_click(() => { if (!this.demo) run("space.select", { id: space.id }); })
        .on_mouse_down("right", () => {
          if (this.demo) return;
          openOverlay({
            mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: space.id } },
          });
        })
        .when(mine.length > 0, (el) => el.children(
          mine.slice(0, 4).map((entry) => image(faceOf(entry.who, entry.status)).w(18).h(18).flex_none())))
        .when(mine.length === 0, (el) => el.child(dot(C.ink3, 6)))
        .child(spaceLabel(space, cast))
        .when(cursor, (el) => el.child(div().id(`nc-cursor-${space.id}`).absolute().left(-3).top(-3).right(-3).bottom(-3)
          .rounded(16).border(2).border_color(C.ink)));
    };

    const group = (entry) => div().flex_none().flex().flex_row().items_center().gap(6)
      .when(Boolean(entry.name), (el) => el.child(div().mr(4).flex_none().text_size(12).font_weight(600)
        .text_color(C.ink2).child(entry.name)))
      .children(entry.spaces.map(plate));

    const left = div().flex_1().min_w(0).h_full().flex().flex_row().items_center().gap(18).overflow_hidden()
      .children(groups.map(group))
      .child(div().id("nc-space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
        .cursor_pointer().hover((el) => el.bg("#ffffff10"))
        .on_click(() => { if (!this.demo) run("space.new"); })
        .child(svg(icon("plus")).size(14).text_color(C.ink2)));

    const meter = div().id("nc-meter").flex_none().flex().flex_row().items_center().gap(14).cursor_pointer()
      .tooltip(words(lang).accounts)
      .on_click(() => this.toggleAccounts())
      .child(image(`${UI_ART}panel/meter-head.svg`).w(20).h(28).flex_none())
      .children(this.meterBlocks().map((account) => this.accountBlock(account)));

    return div().w_full().h(48).flex_none().flex().flex_row().items_center().px(16).gap(18)
      .bg(C.foot).border_t(1).border_color(C.line)
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.key(event, cx))
      .child(left)
      .child(meter);
  }
}
