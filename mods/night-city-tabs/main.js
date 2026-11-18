import { View, div, svg, image } from "gpui-kit";
import { InputState, Input, ScrollHandle } from "gpui-base";
import { focused, layout, nextCommand, openOverlay, props, run, setShared, shared, spaces, window } from "herdr";
import { C, QUERY_KEY, SHARED_KEY, dot, icon, kbd, neonIcon, paneTarget, words } from "./neon.js";
import { demoLang, demoMatch, demoSpace } from "./demo.js";

const PANELS_KEY = "panels";
const DEFAULT_PANELS = ["files", "changes"];

/** The next id in drawn order, wrapping; an id that left the strip starts at the first. */
export function stepCursor(ids, id, delta) {
  if (!ids.length) return null;
  const at = ids.indexOf(id);
  if (at < 0) return ids[0];
  return ids[(at + delta + ids.length) % ids.length];
}

export function dotColour(status) {
  if (status === "blocked") return C.pink;
  if (status === "working") return C.cyan;
  if (status === "done") return C.mustard;
  if (status === "idle") return C.violet;
  return C.ink3;
}

export function shownTabs(space) {
  return (space?.tabs ?? []).filter((tab) => !tab.settled);
}

export function panelMemory(panels, spaceId, enabled) {
  const stored = panels?.[spaceId] ?? null;
  return enabled.includes(stored) ? stored : null;
}

export function rememberPanel(panels, spaceId, current) {
  if (panels[spaceId] === current) return panels;
  return { ...panels, [spaceId]: current };
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function readPanels() {
  try {
    const value = JSON.parse(localStorage.getItem(PANELS_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export default class NightCityTabs extends View {
  init(_props, cx) {
    this.demo = (props() ?? {}).demo === true;
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
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.revealIndex = undefined;
    this.cursorIndex = -1;
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
    this.searchFocused = false;
    this.space = undefined;
    this.pending = null;
    this.panels = this.demo ? {} : readPanels();
    const lang = this.demo ? demoLang : shared(SHARED_KEY)?.lang ?? "en";
    this.input = InputState.new({ placeholder: words(lang).search });
    this.input.on("change", (_event, cx) => {
      const value = this.input.value();
      if (value !== (shared(QUERY_KEY) ?? "")) setShared(QUERY_KEY, value);
      cx.notify();
    });
    this.input.on("submit", () => this.fire("night-city-street.focus"));
    this.input.on("focus", (_event, cx) => { this.searchFocused = true; cx.notify(); });
    this.input.on("blur", (_event, cx) => { this.searchFocused = false; cx.notify(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        this.command(command);
        cx.notify();
      }
    });
  }

  // One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many small events per
  // gesture: a short swipe or one smoothed notch (about 25 px) switches one tab, a longer swipe
  // keeps going a tab per 60 px, at most one every 100 ms so each shows.
  wheel(event) {
    if (event.delta_lines) {
      if (event.delta_lines.y) this.fire(event.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    // Phases often arrive only as moves (a macOS touchpad included): a pause or a turn starts a new gesture.
    if (event.touch_phase === "started" || now - s.at > 250 || event.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += event.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    this.fire(event.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  command(command) {
    if (command === "focus") {
      this.handle.focus();
      this.ensureCursor(shownTabs(this.currentSpace()));
    } else if (command === "search") {
      this.input.focus();
    } else if (command === "clear") {
      this.input.set_value("");
      if ((shared(QUERY_KEY) ?? "") !== "") setShared(QUERY_KEY, "");
    } else if (command === "files" || command === "changes") {
      this.togglePanel(command);
    } else if (command === "left" || command === "right") {
      this.stepCursor(command === "left" ? -1 : 1);
    } else if (command === "select") {
      this.selectCursor();
    } else if (command === "move_left" || command === "move_right") {
      this.moveCursorTab(command === "move_left" ? -1 : 1);
    }
  }

  currentSpace() {
    return this.demo ? demoSpace() : spaces().find((candidate) => candidate.active);
  }

  ensureCursor(shown) {
    if (this.cursor && shown.some((tab) => tab.id === this.cursor)) return this.cursor;
    const start = shown.find((tab) => tab.active) ?? shown[0];
    this.cursor = start ? start.id : null;
    return this.cursor;
  }

  stepCursor(delta) {
    const shown = shownTabs(this.currentSpace());
    const next = stepCursor(shown.map((tab) => tab.id), this.ensureCursor(shown), delta);
    if (next) this.cursor = next;
  }

  selectCursor() {
    const id = this.ensureCursor(shownTabs(this.currentSpace()));
    if (id) this.fire("tab.select", { id });
  }

  moveCursorTab(delta) {
    const space = this.currentSpace();
    const shown = shownTabs(space);
    const at = shown.findIndex((tab) => tab.id === this.ensureCursor(shown));
    const neighbor = shown[at + delta];
    if (at < 0 || !neighbor) return;
    const index = space.tabs.findIndex((tab) => tab.id === neighbor.id) + 1;
    this.fire("tab.move", { id: shown[at].id, index });
  }

  togglePanel(id) {
    const panel = find(layout(), "panel");
    if (!panel) return;
    const body = find(layout(), "panel-body");
    if (!panel.hidden && body?.active === id) this.fire("layout.hide", { id: "panel" });
    else {
      this.fire("layout.select", { stack: "panel-body", child: id });
      this.fire("layout.show", { id: "panel" });
    }
  }

  key(event, cx) {
    const mod = event.modifiers ?? {};
    const space = this.currentSpace();
    const shown = shownTabs(space);
    const id = this.ensureCursor(shown);
    const tab = shown.find((candidate) => candidate.id === id) ?? null;
    const plain = !mod.platform && !mod.control && !mod.alt;
    if (event.key === "p" && mod.control && mod.alt && !mod.platform) {
      // The keys.json binding alone does not hand the keyboard back from a focused strip.
      this.fire("pane.go", { direction: "down" });
    } else if (event.key === "escape") {
      const target = this.demo ? null : paneTarget(focused());
      if (target) run("pane.focus", target);
      else this.fire("pane.go", { direction: "down" });
    } else if (this.searchFocused) {
      return;
    } else if (event.key === "left" && mod.shift) {
      this.moveCursorTab(-1);
    } else if (event.key === "right" && mod.shift) {
      this.moveCursorTab(1);
    } else if (event.key === "left") {
      this.stepCursor(-1);
    } else if (event.key === "right") {
      this.stepCursor(1);
    } else if (event.key === "enter" || event.key === "space") {
      if (tab) this.fire("tab.select", { id: tab.id });
    } else if (plain && event.key === "f") {
      this.togglePanel("files");
    } else if (plain && event.key === "c") {
      this.togglePanel("changes");
    } else if (plain && event.key === "/") {
      this.input.focus();
    } else if (plain && event.key === "m" && tab && !this.demo) {
      openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: tab.id, space: space.id } } });
    } else {
      return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  // The side panel is remembered per space: a switch shows that space's choice (closed if it
  // never had one), and opening or closing it records the choice.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id;
      this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const want = panelMemory(this.panels, space.id, enabled);
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) {
            run("layout.select", { stack: "panel-body", child: want });
            run("layout.show", { id: "panel" });
          } else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else wins), the layout's old state is not a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    const next = rememberPanel(this.panels, space.id, now);
    if (next !== this.panels) {
      this.panels = next;
      try { localStorage.setItem(PANELS_KEY, JSON.stringify(this.panels)); } catch {}
    }
  }

  render() {
    const state = this.demo ? {} : shared(SHARED_KEY) ?? {};
    const open = this.demo ? shared(SHARED_KEY)?.demoOpen : null;
    const lang = this.demo ? demoLang : state.lang ?? "en";
    const space = this.currentSpace();
    const shown = shownTabs(space);
    this.ensureCursor(shown);
    const matched = open ? shown.filter((tab) => demoMatch(tab.name, open.name)) : [];
    const activeTab = matched.length ? matched[0] : shown.find((tab) => tab.active) ?? null;
    const activeIndex = activeTab ? shown.indexOf(activeTab) : -1;
    const cursorIndex = this.handle.is_focused() && this.cursor ? shown.findIndex((tab) => tab.id === this.cursor) : -1;
    if (activeIndex !== this.revealIndex) {
      this.revealIndex = activeIndex;
      if (activeIndex >= 0) this.scroll.scroll_to_item(activeIndex);
    }
    if (cursorIndex !== this.cursorIndex) {
      this.cursorIndex = cursorIndex;
      if (cursorIndex >= 0) this.scroll.scroll_to_item(cursorIndex);
    }
    const stop = (_event, cx) => cx.stop_propagation();
    // `herdr-app check` renders without a window, so window() can be null there.
    const w = window() ?? {};
    const pad = w.platform === "macos" && w.buttons === false && !w.fullscreen ? 84 : 16;

    const control = (id, child, action, tip) => div().id(id).size(26).flex_none().flex().items_center().justify_center()
      .rounded(6).cursor_pointer().hover((el) => el.bg("#ffffff10"))
      .on_mouse_down("left", stop).on_click(action)
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .child(child);

    const history = div().flex_none().flex().flex_row().items_center().gap(4)
      .child(control("nc-back", svg(icon("back")).size(14).text_color(C.ink2), () => this.fire("night-city-street.back"), "⌘["))
      .child(control("nc-forward", svg(icon("forward")).size(14).text_color(C.ink2), () => this.fire("night-city-street.forward"), "⌘]"));

    const tabBody = (tab, index) => {
      const active = matched.length ? matched.includes(tab) : Boolean(tab.active);
      const cursor = this.handle.is_focused() && this.cursor === tab.id;
      return div().id(`nc-tab-${tab.id}`).relative().h(26).px(14).gap(8).flex().items_center().flex_none()
        .max_w(220).rounded_t(3).rounded_b(7).border(1).border_color(active ? C.mustard : C.line2).bg(C.card)
        .text_size(12.5).font_weight(500).text_color(active ? C.white : C.ink2).cursor_pointer()
        .on_mouse_down("left", (event, cx) => {
          cx.stop_propagation();
          this.pressed = index;
          if (event.click_count === 2) this.fire("tab.rename", { id: tab.id });
        })
        .on_mouse_up("left", () => {
          const from = this.pressed;
          this.pressed = null;
          if (from !== null && from !== index) {
            if (!shown[from]) return;
            this.fire("tab.move", { id: shown[from].id, index: space.tabs.findIndex((candidate) => candidate.id === tab.id) + 1 });
          } else this.fire("tab.select", { id: tab.id });
        })
        .on_mouse_down("right", (_event, cx) => {
          cx.stop_propagation();
          if (!this.demo) openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: tab.id, space: space.id } } });
        })
        .child(div().absolute().left("50%").top(-5).w(1).h(5).bg("#d8d0e266"))
        .child(dot(dotColour(tab.status), 6))
        .child(div().max_w(170).truncate().child(tab.name))
        .when(active, (el) => el.child(div().id(`nc-close-${tab.id}`).flex_none().cursor_pointer()
          .on_mouse_down("left", stop)
          .on_click((_event, cx) => { cx.stop_propagation(); this.fire("tab.close", { id: tab.id }); })
          .child(svg(icon("close")).size(12).text_color(C.ink2))))
        .when(active, (el) => el.child(div().absolute().left(-1).top(-1).right(-1).bottom(-1)
          .rounded_t(4).rounded_b(8).border(1).border_color("#d8b25c44")))
        .when(active, (el) => el.child(div().absolute().left(0).right(0).bottom(0).h(2).bg("#d8b25c66")))
        .when(cursor, (el) => el.child(div().id(`nc-cursor-${tab.id}`).absolute().left(-3).top(-3).right(-3).bottom(-3)
          .rounded_t(5).rounded_b(9).border(2).border_color(C.ink)));
    };

    // The strip is 44 high so the tabs' upper wire, cursor ring and active border are not clipped
    // by the scrolling area; only the tabs themselves scroll, and the `+` stays outside.
    const tabScroll = div().id("nc-tab-scroll").min_w(0).h(44).pt(14).px(3).flex().flex_row().items_start().gap(4)
      .overflow_x_scrollbar().track_scroll(this.scroll)
      .on_size_change((_size, cx) => { if (activeIndex >= 0) { this.scroll.scroll_to_item(activeIndex); cx.notify(); } })
      .children(shown.map(tabBody));

    const tabs = div().id("nc-tabs").relative().flex_1().min_w(0).h(44)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel((event) => this.wheel(event))
      .child(div().absolute().left(0).top(9).w_full().h(1).bg("#d8d0e233"))
      .child(div().flex().flex_row().items_start().min_w(0).h(44)
        .child(tabScroll)
        .child(div().pt(14).ml(4).flex_none()
          .child(control("nc-tab-new", svg(icon("plus")).size(14).text_color(C.ink2),
            () => { if (!this.demo) openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }); }))));

    const notice = this.demo ? null : shared("night-city.notice");
    const noticeWords = words(lang);
    const noticeAct = (id, label, command) => div().id(id).flex_none().h(20).px(6).flex().items_center().rounded(10)
      .cursor_pointer().text_size(11).font_weight(600)
      .text_color(notice?.tone === "err" ? C.pink : C.mustard)
      .hover((el) => el.bg("#ffffff12"))
      .on_mouse_down("left", stop)
      .on_click((_event, cx) => { cx.stop_propagation(); this.fire(command); })
      .child(label);
    const noticeEl = notice?.text
      ? div().flex_none().flex().items_center().gap(6).h(24).rounded(12).px(10).max_w(320)
        .border(1).border_color(notice.tone === "err" ? C.pink : C.line2)
        .text_size(11.5).text_color(notice.tone === "err" ? C.pink : C.ink2)
        .child(div().max_w(220).truncate().child(String(notice.text)))
        .when(Boolean(notice.undo), (el) => el.child(noticeAct("nc-notice-undo", noticeWords.undo, "night-city-street.undo")))
        .when(Boolean(notice.retry), (el) => el.child(noticeAct("nc-notice-retry", noticeWords.retry, "night-city-street.retry")))
      : null;

    const root = this.demo ? null : layout();
    const panel = find(root, "panel");
    const panelBody = find(root, "panel-body");
    const given = this.demo ? null : shared("workspace.panels");
    const enabled = Array.isArray(given) ? given : DEFAULT_PANELS;
    if (space && panel) this.syncPanel(space, panel, panelBody, enabled);
    const panelButtons = panel && panelBody ? enabled.map((id) => {
      const on = !panel.hidden && panelBody.active === id;
      return div().id(`nc-panel-${id}`).size(26).flex_none().flex().items_center().justify_center()
        .rounded(6).cursor_pointer().hover((el) => el.bg("#ffffff10"))
        .on_mouse_down("left", stop)
        .on_click(() => this.togglePanel(id))
        .child(svg(icon(id === "changes" ? "branch" : "folder")).size(14).text_color(on ? C.cyan : C.ink2));
    }) : [];

    const search = div().id("nc-search").w(264).h(32).flex_none().flex().items_center().gap(8).rounded(8).px(12)
      .border(1).border_color(this.searchFocused ? C.cyan : C.line2).bg(C.well)
      .on_mouse_down("left", stop)
      .child(image(neonIcon("search", "cyan")).w(16).h(16).flex_none())
      .child(Input.new(this.input).flex_1().text_size(13).text_color(C.ink))
      .child(kbd("/"));

    const windowButtons = w.buttons ? [
      control("nc-win-min", svg(icon("win-min")).size(14).text_color(C.ink2), () => this.fire("window.minimize")),
      control("nc-win-max", svg(icon(w.maximized ? "win-restore" : "win-max")).size(14).text_color(C.ink2), () => this.fire("window.maximize")),
      control("nc-win-close", svg(icon("win-close")).size(14).text_color(C.ink2), () => this.fire("window.close")),
    ] : [];

    return div().w_full().h(44).flex_none().flex().flex_row().items_center().gap(14).pl(pad).pr(16).bg(C.night)
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.key(event, cx))
      .child(history)
      .child(tabs)
      .when(Boolean(noticeEl), (el) => el.child(noticeEl))
      .children(panelButtons)
      .child(search)
      .child(control("nc-help", kbd("?"), () => this.fire("night-city-street.legend")))
      .children(windowButtons);
  }
}
