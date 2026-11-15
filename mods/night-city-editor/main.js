import { View, div, svg } from "gpui-kit";
import { Editor, EditorState, TextView } from "gpui-base";
import { focused, home, nextCommand, panes, props, readTextFile, run, settings, shared, writeTextFile } from "herdr";
import { C, MONO, SHARED_KEY, dot, icon } from "./neon.js";

const LANGUAGES = {
  md: "markdown", sql: "sql", py: "python", ts: "typescript", js: "javascript",
  json: "json", yaml: "yaml", yml: "yaml", sh: "shell",
};

const TEXT = {
  ko: { save: "저장", reload: "다시 읽기", code: "코드", preview: "미리보기", openTab: "탭으로 열기", changed: "디스크의 파일이 바뀌었습니다" },
  en: { save: "Save", reload: "Reload", code: "Code", preview: "Preview", openTab: "Open as tab", changed: "File changed on disk" },
};

export function splitPath(path) {
  const text = String(path ?? "");
  const cut = text.lastIndexOf("/");
  if (cut < 0) return { name: text, dir: "" };
  return { name: text.slice(cut + 1), dir: cut === 0 ? "/" : text.slice(0, cut) };
}

/** The folder as the header shows it, with the home folder written as `~`. */
export function shortDir(dir, homeDir) {
  if (!homeDir) return dir;
  const home = homeDir.replace(/\/+$/, "");
  // The root is not a home folder to shorten against.
  if (!home) return dir;
  if (dir === home) return "~";
  if (dir.startsWith(`${home}/`)) return `~/${dir.slice(home.length + 1)}`;
  return dir;
}

export function languageOf(path) {
  const name = splitPath(path).name;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "plain";
  return LANGUAGES[name.slice(dot + 1).toLowerCase()] ?? "plain";
}

/** Reads a file for the editor: a missing one becomes an empty new file (`original` null). */
export async function loadDoc(file, read = readTextFile) {
  const text = await read(file);
  return { text: text ?? "", original: text };
}

/** Writes the buffer; `original` is the text last read or saved, so a file changed since rejects. */
export async function saveDoc(file, text, original, write = writeTextFile) {
  try {
    await write(file, text, original);
    return { ok: true, original: text };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) };
  }
}

export default class NightCityEditor extends View {
  init(_props, cx) {
    const given = props() ?? {};
    this.uid = given.pane ?? "editor";
    this.file = given.file ?? null;
    this.original = null;
    this.editor = null;
    this.dirty = false;
    this.stale = false;
    this.mode = "code";
    this.handle = cx.focus_handle();
    this.load(cx);
    this.commands(cx);
  }

  ids(suffix) {
    return `night-city-editor-${this.uid}-${suffix}`;
  }

  load(cx) {
    const file = this.file;
    if (!file) return;
    cx.spawn(async (cx) => {
      try {
        const { text, original } = await loadDoc(file);
        if (this.file !== file) return;
        this.stale = false;
        this.mount(text, original);
      } catch {
        if (this.file !== file) return;
        this.mount("", null);
        this.stale = true;
      }
      cx.notify();
    });
  }

  commands(cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "save") this.save(cx);
        else if (command === "focus") {
          this.handle.focus();
          cx.notify();
        }
      }
    });
  }

  mount(value, original) {
    this.editor?.release();
    this.original = original;
    this.editor = EditorState.new({
      language: languageOf(this.file),
      value,
      font_family: settings().font_family,
      font_size: 13,
      syntax: {
        keyword: C.pink, string: C.mustard, comment: C.ink3, function: C.cyan, type: C.violet,
        number: C.mustard, constant: C.violet, variable: C.ink, operator: C.ink2,
        punctuation: C.ink2, boolean: C.violet,
      },
    });
    this.editor.on("change", (_event, cx) => {
      this.dirty = this.editor.value() !== this.original;
      cx.notify();
    });
    this.dirty = false;
  }

  save(cx, then) {
    const editor = this.editor;
    if (!editor || !this.file) return;
    const file = this.file;
    const value = editor.value();
    cx.spawn(async (cx) => {
      const saved = await saveDoc(file, value, this.original);
      if (this.file !== file) return;
      if (saved.ok) {
        this.original = saved.original;
        this.stale = false;
        this.dirty = (this.editor?.value() ?? "") !== saved.original;
      } else {
        this.stale = true;
      }
      if (saved.ok && !this.dirty) then?.();
      cx.notify();
    });
  }

  reload(cx) {
    const file = this.file;
    if (!file) return;
    cx.spawn(async (cx) => {
      try {
        const { text, original } = await loadDoc(file);
        if (this.file !== file) return;
        this.stale = false;
        this.mount(text, original);
      } catch {}
      cx.notify();
    });
  }

  ownPane() {
    const id = (props() ?? {}).pane ?? focused()?.pane;
    const pane = panes().find((p) => p.pane === id);
    return pane?.mod === "night-city-editor" ? pane : null;
  }

  toTab(cx) {
    const pane = this.ownPane();
    const file = this.file;
    if (!pane || !file) return;
    const move = () => {
      run("tab.new", { mod: "night-city-editor", props: { file } });
      run("pane.close", { pane: pane.pane });
    };
    if (this.dirty) this.save(cx, move);
    else move();
  }

  render() {
    const lang = shared(SHARED_KEY)?.lang ?? "en";
    const text = TEXT[lang] ?? TEXT.en;
    const { name, dir } = splitPath(this.file ?? "");
    let homeDir = "";
    try { homeDir = home(); } catch {}
    const markdown = languageOf(this.file) === "markdown";
    const pane = this.ownPane();
    const inTab = pane ? panes().filter((p) => p.tab === pane.tab).length > 1 : false;

    const chip = (id, label, opts = {}) => {
      const active = Boolean(opts.active);
      const warn = Boolean(opts.warn);
      return div().id(this.ids(id)).flex_none().h(22).px(10).flex().items_center().justify_center().rounded(6)
        .border(1).border_color(warn ? C.mustard : active ? C.cyan : C.line2)
        .bg(C.card).text_size(11.5).text_color(warn ? C.mustard : active ? C.cyan : C.ink2)
        .cursor_pointer().hover((s) => s.bg("#ffffff10"))
        .on_click(opts.onClick)
        .child(label);
    };

    const header = div().h(34).flex_none().flex().flex_row().items_center().gap(8).px(12)
      .bg(C.bar).border_b(1).border_color(C.line)
      .child(svg(icon("pencil")).w(14).h(14).flex_none().text_color(C.cyan))
      .child(div().flex_none().text_size(12.5).font_weight(600).text_color(C.ink).truncate().child(name))
      .child(div().flex_1().text_size(11).font_family(MONO).text_color(C.ink3).truncate().child(shortDir(dir, homeDir)))
      .when(this.dirty, (el) => el.child(dot(C.mustard)))
      .when(markdown, (el) => el
        .child(chip("code", text.code, {
          active: this.mode === "code",
          onClick: (_event, cx) => { this.mode = "code"; cx.notify(); },
        }))
        .child(chip("preview", text.preview, {
          active: this.mode === "preview",
          onClick: (_event, cx) => { this.mode = "preview"; cx.notify(); },
        })))
      .child(chip("save", text.save, { warn: this.dirty, onClick: (_event, cx) => this.save(cx) }))
      .when(this.stale, (el) => el.child(chip("reload", text.reload, { onClick: (_event, cx) => this.reload(cx) })))
      .when(inTab, (el) => el.child(chip("open-tab", text.openTab, { onClick: (_event, cx) => this.toTab(cx) })));

    const body = !this.editor
      ? div().flex_1().w_full().bg(C.pane)
      : markdown && this.mode === "preview"
        ? div().flex_1().w_full().overflow_y_scrollbar().bg(C.pane).px(14).py(10)
          .child(TextView.markdown(this.ids("preview"), this.editor.value()).scrollable(true))
        : div().flex_1().w_full().overflow_hidden().bg(C.pane)
          .child(Editor.new(this.editor).size_full());

    return div().id(this.ids("root")).size_full().flex().flex_col().bg(C.pane)
      .track_focus(this.handle)
      .on_key_down((event, cx) => {
        const modifiers = event.modifiers ?? {};
        if (!modifiers.platform) return;
        if (event.key === "s") this.save(cx);
        else if (event.key === "r") {
          if (this.stale) this.reload(cx);
        } else if (event.key === "e" && markdown) {
          this.mode = this.mode === "preview" ? "code" : "preview";
          cx.notify();
        } else if (event.key === "o" && inTab) this.toTab(cx);
        else return;
        cx.stop_propagation();
      })
      .child(header)
      .when(this.stale, (el) => el.child(div().h(18).flex_none().flex().items_center().px(12).bg(C.pane)
        .text_size(11).text_color(C.pink).child(text.changed)))
      .child(body);
  }
}
