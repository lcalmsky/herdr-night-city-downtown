import { View, div, svg } from "gpui-kit";
import { panes, props, run, shared } from "herdr";
import { C, MONO, SHARED_KEY, dot, icon, tintOf } from "./neon.js";

export function sessionOf(cast, pane, terminal) {
  return (cast ?? []).find((c) => (c.pane && c.pane === pane) || (c.terminal && c.terminal === terminal)) ?? null;
}

function iconButton(id, name, onClick) {
  return div().id(id).flex_none().w(20).h(20).flex().items_center().justify_center().rounded(5).cursor_pointer()
    .text_color(C.ink3).hover((s) => s.bg("#ffffff10").text_color(C.ink))
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click(onClick)
    .child(svg(icon(name)).w(12).h(12));
}

function underline(bottom, color) {
  return div().absolute().left(0).bottom(bottom).w_full().h(1).bg(color);
}

export default class NightCityPane extends View {
  render() {
    const given = props() ?? {};
    const paneId = given.pane;
    const info = panes().find((p) => p.pane === paneId) ?? null;
    const terminal = given.terminal ?? info?.terminal ?? null;
    const state = shared(SHARED_KEY) ?? {};
    const session = sessionOf(state.cast ?? [], paneId, terminal);
    const modName = !terminal && info?.mod ? info.mod : null;
    const title = modName ?? session?.name ?? info?.title ?? "";
    const tint = session ? tintOf(session.tint) : null;
    const selected = Boolean(session && state.sel === session.id);

    const close = () => iconButton(`pane-${paneId}-close`, "close", () => run("pane.close", { pane: paneId }));
    const zoom = () => iconButton(
      `pane-${paneId}-${info?.zoomed ? "unzoom" : "zoom"}`,
      info?.zoomed ? "unzoom" : "zoom",
      () => run("pane.zoom", { pane: paneId }),
    );
    const buttons = modName
      ? [zoom(), close()]
      : [
        iconButton(`pane-${paneId}-split-right`, "split-right", () => run("pane.split", { pane: paneId, direction: "right" })),
        iconButton(`pane-${paneId}-split-down`, "split-down", () => run("pane.split", { pane: paneId, direction: "down" })),
        zoom(),
        close(),
      ];

    const lines = selected
      ? [underline(0, tint), underline(1, `${tint}55`)]
      : info?.focused ? [underline(0, `${C.mustard}88`)] : [];

    return div().id(`night-city-pane-${paneId}`).relative().w_full().h(30).flex_none().flex().flex_row().items_center().gap(8).px(12)
      .bg(C.pane).border_b(1).border_color("#221c3d")
      .child(svg(icon("terminal")).w(14).h(14).flex_none().text_color(C.ink3))
      .when(session, (el) => el.child(dot(tint)))
      .child(div().flex_1().text_size(12).font_weight(500).text_color(info?.focused ? C.ink : C.ink3).truncate().child(title))
      .when(Boolean(session?.ticket), (el) => el.child(div().flex_none().text_size(11).font_family(MONO).text_color(C.ink3).child(session.ticket)))
      .children(buttons)
      .children(lines);
  }
}
