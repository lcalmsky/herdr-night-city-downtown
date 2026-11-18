import { View, div, image, svg } from "gpui-kit";
import { Input, InputState, ScrollHandle } from "gpui-base";
import {
  appHome, closeOverlay, exec, focused, home, knownAgents, props, run, setShared, shared, spaces, terminals,
} from "herdr";
import * as herdrApi from "herdr";
import { ACCOUNTS_KEY, C, MONO, SHARED_KEY, UI_ART, gradient, kbd, segs, dot, icon, neonIcon } from "./neon.js";
import { demoAgents, demoModel } from "./demo.js";

export const DEFAULT_LAUNCH = "claude";
export const ACCOUNT_NAME = /^[A-Za-z0-9_-]+$/;
export const SESSION_ID = /^[0-9a-fA-F-]{36}$/;

export const POPUP_H = 700;
const POPUP_BORDER = 1;
const POPUP_PAD = 14;
const POPUP_HEADER_H = 40;
const POPUP_FOOTER_H = 18;
export const LIST_MAX_H = POPUP_H - 2 * POPUP_BORDER - 2 * POPUP_PAD - POPUP_HEADER_H - POPUP_FOOTER_H;

// An older Herdr has no `checking` export, and a named import would take the whole mod down.
const checking = () => typeof herdrApi.checking === "function" && herdrApi.checking() === true;

export const TEXT = {
  ko: {
    agents: "에이전트", claude: "클로드", codex: "코덱스",
    custom: "직접 명령", continueAs: "다른 계정으로 이어가기",
    newPane: "새 pane", addClaude: "클로드 계정 추가", addCodex: "코덱스 계정 추가",
    addCustom: "직접 명령 추가…", command: "클로드 명령", systemDefault: "시스템 기본",
    thisPane: "· 이 pane", name: "이름", start: "시작 명령", rename: "표시 이름",
    hintCustom: "셸에서 실행되므로 claude-gpt 같은 함수도 됩니다 · ↩ 추가 · esc 취소",
    hintAgent: "↩ 새 pane 에서 시작",
    hintAccount: "↩ 기본 계정으로 · o 새 pane · 연필로 이름 바꾸기",
    hintCodex: "↩ 기본 계정으로 · o 새 pane",
    hintModel: "↩ 기본으로 · o 새 pane · 연필로 이름 바꾸기",
    hintCommand: "↩ 클로드 시작 명령 고치기",
    hintAdd: "↩ 추가",
    hintContinue: "↩ 이 계정으로 새 pane 에서 이어가기",
    failed: "cca 실행에 실패했습니다",
    noCodex: "코덱스 CLI 를 찾지 못했습니다",
    needName: "이름을 입력하세요",
    needCommand: "시작 명령을 입력하세요",
    notInstalled: (names) => `설치되지 않음: ${names}`,
  },
  en: {
    agents: "AGENTS", claude: "CLAUDE", codex: "CODEX",
    custom: "CUSTOM COMMANDS", continueAs: "CONTINUE THIS SESSION AS",
    newPane: "new pane", addClaude: "Add Claude account", addCodex: "Add Codex account",
    addCustom: "Add custom command…", command: "Claude command", systemDefault: "System default",
    thisPane: "· this pane", name: "Name", start: "Start command", rename: "Display name",
    hintCustom: "runs in your shell, so functions like claude-gpt work · ↩ add · esc cancel",
    hintAgent: "↩ start in a new pane",
    hintAccount: "↩ make the default · o new pane · pencil renames",
    hintCodex: "↩ make the default · o new pane",
    hintModel: "↩ make the default · o new pane · pencil renames",
    hintCommand: "↩ edit the Claude command",
    hintAdd: "↩ add",
    hintContinue: "↩ resume under this account in a new pane",
    failed: "Could not run cca",
    noCodex: "Codex CLI was not found",
    needName: "Type a name",
    needCommand: "Type a start command",
    notInstalled: (names) => `Not installed: ${names}`,
  },
};

export const strings = (lang) => TEXT[lang] ?? TEXT.en;

export function shellQuote(value) {
  const text = String(value ?? "");
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

export function launchLine(env, command, args) {
  return command === DEFAULT_LAUNCH
    ? `${env} exec claude${args}`
    : `${env} exec "\${SHELL:-/bin/zsh}" -ic ${shellQuote(command + args)}`;
}

export function launchFor(name, args, command = DEFAULT_LAUNCH) {
  if (name && typeof name === "object") {
    return `unset CLAUDE_CONFIG_DIR; CCA_ACCOUNT=${name.name} exec "\${SHELL:-/bin/zsh}" -ic ${shellQuote(`${name.command}${args}`)}`;
  }
  const env = name === "default"
    ? "unset CLAUDE_CONFIG_DIR; CCA_ACCOUNT=default"
    : `CLAUDE_CONFIG_DIR="$HOME/.claude-accounts/${name}" CCA_ACCOUNT=${name}`;
  return launchLine(env, command, args);
}

export function resumeOrStart(name, id, command = DEFAULT_LAUNCH) {
  const folder = name === "default" ? '"$HOME/.claude"' : `"$HOME/.claude-accounts/${name}"`;
  return `set -- ${folder}/projects/*/${id}.jsonl; if [ -s "$1" ]; then ${launchFor(name, ` --resume ${id}`, command)}; `
    + `else ${launchFor(name, "", command)}; fi`;
}

export function codexLaunch(dir, run) {
  const words = (Array.isArray(run) ? run : []).filter((w) => typeof w === "string" && w);
  const command = `exec ${words.map(shellQuote).join(" ")}`;
  if (!dir) return command;
  const path = String(dir);
  const target = path.startsWith("~/") ? `"$HOME"/${shellQuote(path.slice(2))}` : shellQuote(path);
  return `CODEX_HOME=${target} ${command}`;
}

export function claudeArgv(name, command = DEFAULT_LAUNCH) {
  return ["sh", "-lc", launchFor(name, "", command)];
}

export function codexArgv(name, run) {
  const dir = !name || name === "default" ? null : `~/.codex-accounts/${name}`;
  return ["sh", "-lc", codexLaunch(dir, run)];
}

export function codexLoginArgv(dir) {
  return ["sh", "-lc", codexLaunch(dir, ["codex", "login"])];
}

export function modelArgv(model) {
  return ["sh", "-lc", launchFor(model, "")];
}

export function agentArgv(agent) {
  return Array.isArray(agent?.run) ? agent.run : null;
}

export function resumeArgs(target, id) {
  const model = target && typeof target === "object" && target.kind === "model" ? target : null;
  if (!model) return ` --resume ${id}`;
  // The template is appended to the command, so it carries the separating space like the Claude form.
  return model.resume ? ` ${String(model.resume).replaceAll("{id}", id)}` : null;
}

export function continueArgv(target, session, command = DEFAULT_LAUNCH) {
  const model = target && typeof target === "object" && target.kind === "model" ? target : null;
  const name = target && typeof target === "object" ? target.name : target;
  if (!ACCOUNT_NAME.test(name ?? "") || !SESSION_ID.test(session?.id ?? "") || !session?.cwd) return null;
  const args = resumeArgs(model, session.id);
  if (!args) return null;
  const cwd = `'${String(session.cwd).replace(/'/g, "'\\''")}'`;
  const line = model ? launchFor(model, args) : resumeOrStart(name, session.id, command);
  return ["sh", "-lc", `cd ${cwd} || exit 1; ${line}`];
}

/** A usage value arrives as a percentage; the meters want 0..1. */
export function percentOf(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Math.max(0, Math.min(1, Number(text) / 100));
}

export function remaining(reset, now, lang = "en") {
  if (!reset) return "";
  const seconds = Math.floor(Number(reset) - now / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (lang === "ko") {
    if (days) return `${days}일 ${hours}시간`;
    if (hours) return `${hours}시간 ${minutes}분`;
    return `${minutes}분`;
  }
  if (days) return `${days}d ${hours}h`;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function parsePorcelain(text) {
  const out = {
    current: "default", globalDefault: "default", session: null,
    accounts: [], models: [], labels: {},
    codex: { active: "default", accounts: [] },
  };
  const byName = {};
  const codexByName = {};
  const win = (used, reset) => {
    const ratio = percentOf(used);
    if (ratio == null) return null;
    return { used: ratio, reset: /^\d+$/.test(reset ?? "") ? Number(reset) : null };
  };
  const codexAccount = (name) => {
    if (name !== "default" && !ACCOUNT_NAME.test(name ?? "")) return null;
    let c = codexByName[name];
    if (!c) {
      c = { name, email: "", usage: null, plan: null, label: null };
      codexByName[name] = c;
      out.codex.accounts.push(c);
    }
    return c;
  };
  codexAccount("default");
  for (const line of String(text ?? "").split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    const kind = f[0];
    const name = f[1];
    if (kind === "C" && name) out.current = name;
    else if (kind === "D" && ACCOUNT_NAME.test(name ?? "")) out.globalDefault = name;
    else if (kind === "A" && ACCOUNT_NAME.test(name ?? "")) {
      if (!byName[name]) {
        byName[name] = { name, email: (f[2] ?? "").trim(), usage: null, label: null, plan: null };
        out.accounts.push(byName[name]);
      }
    } else if (kind === "M" && ACCOUNT_NAME.test(name ?? "")) {
      if (!byName[name]) {
        byName[name] = {
          name, kind: "model", command: (f[2] ?? "").trim(), resumable: f[3] === "1",
          label: null, usage: null, plan: null, resume: null,
        };
        out.models.push(byName[name]);
      }
    } else if (kind === "L" && name && (f[2] ?? "").trim()) {
      out.labels[name] = f[2].trim();
    } else if (kind === "U" && byName[name]) {
      byName[name].usage = { five: win(f[2], f[3]), seven: win(f[4], f[5]), fable: win(f[6], f[7]) };
    } else if (kind === "P" && byName[name]) {
      byName[name].plan = (f[2] ?? "").trim() || null;
    } else if (kind === "S" && SESSION_ID.test(name ?? "")) {
      out.session = { id: name, cwd: (f[2] ?? "").trim() };
    } else if (kind === "Y" && name && (name === "default" || ACCOUNT_NAME.test(name))) {
      out.codex.active = name;
    } else if (kind === "X") {
      const c = codexAccount(name);
      if (c) c.email = (f[2] ?? "").trim();
    } else if (kind === "V") {
      const c = codexAccount(name);
      if (c) c.usage = { five: win(f[2], f[3]), seven: win(f[4], f[5]), fable: null };
    } else if (kind === "Q") {
      const c = codexAccount(name);
      if (c) c.plan = (f[2] ?? "").trim() || null;
    }
  }
  for (const a of out.accounts) a.label = out.labels[a.name] ?? null;
  for (const m of out.models) m.label = out.labels[m.name] ?? null;
  for (const c of out.codex.accounts) c.label = out.labels[`codex:${c.name}`] ?? null;
  return out;
}

export function parseModelsFile(text) {
  try {
    const list = JSON.parse(String(text ?? "") || "[]");
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

/** The resume template is in models.json, not in the porcelain line; only that is merged here. */
export function attachModels(models, entries) {
  const byId = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry && typeof entry.id === "string") byId[entry.id] = entry;
  }
  for (const model of models ?? []) {
    const entry = byId[model.name];
    if (entry && typeof entry.resume === "string" && entry.resume && !model.resume) model.resume = entry.resume;
  }
  return models;
}

export function emptyModel() {
  return {
    current: "default", globalDefault: "default", session: null,
    accounts: [], models: [], labels: {},
    codex: { active: "default", accounts: [{ name: "default", email: "", usage: null, plan: null, label: null }] },
    agents: [],
  };
}

export function continueTargets(model) {
  if (!SESSION_ID.test(model?.session?.id ?? "") || !model?.session?.cwd) return [];
  const targets = [];
  for (const account of model?.accounts ?? []) {
    if (account.name !== model.current) targets.push({ kind: "account", name: account.name, label: account.label });
  }
  for (const entry of model?.models ?? []) {
    if (!entry.resumable || !entry.resume || entry.name === model.current) continue;
    targets.push({ kind: "model", name: entry.name, label: entry.label, command: entry.command, resume: entry.resume });
  }
  return targets;
}

export function rowsOf(model) {
  const m = model ?? emptyModel();
  const rows = [];
  for (const agent of m.agents ?? []) rows.push({ key: `agent:${agent.key}`, kind: "agent", agent });
  for (const account of m.accounts ?? []) rows.push({ key: `account:${account.name}`, kind: "account", account });
  rows.push({ key: "command", kind: "command" });
  rows.push({ key: "add:claude", kind: "add", target: "claude" });
  for (const account of m.codex?.accounts ?? []) rows.push({ key: `codex:${account.name}`, kind: "codex", account });
  rows.push({ key: "add:codex", kind: "add", target: "codex" });
  for (const entry of m.models ?? []) rows.push({ key: `model:${entry.name}`, kind: "model", model: entry });
  rows.push({ key: "add:model", kind: "add", target: "model" });
  for (const target of continueTargets(m)) rows.push({ key: `continue:${target.name}`, kind: "continue", target });
  return rows;
}

export function moveCursor(count, cursor, delta) {
  if (!count) return 0;
  return Math.max(0, Math.min(count - 1, cursor + delta));
}

const errorLine = (result, fallback) => {
  const lines = String(result?.stderr ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : fallback;
};

export default class Accounts extends View {
  init(_props, cx) {
    const given = props() ?? {};
    this.demo = given.demo === true;
    this.overlay = given.overlay ?? null;
    // The street reads this to keep its flyer clear of the popup, the staged demo picture included.
    if (this.overlay && !checking()) setShared(ACCOUNTS_KEY, { overlay: this.overlay });
    this.model = emptyModel();
    this.allAgents = [];
    this.modelEntries = [];
    this.command = DEFAULT_LAUNCH;
    this.stateDir = null;
    this.edit = null;
    this.cursor = 0;
    this.error = null;
    this.readError = null;
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.scrollKey = undefined;
    cx.timer.after(60, () => this.handle.focus());
    if (this.demo) {
      this.allAgents = demoAgents();
      this.model = demoModel();
      this.cursor = moveCursor(rowsOf(this.model).length, 0, 0);
      return;
    }
    if (checking()) return;
    cx.spawn(async (cx) => {
      await this.loadSettings(cx);
      try {
        const agents = await knownAgents();
        this.allAgents = (agents ?? []).filter((a) => Array.isArray(a?.run) && a.run.length);
      } catch {
        this.allAgents = [];
      }
      await this.refresh(cx);
    });
    cx.timer.every(30_000, (cx) => this.refreshLater(cx));
  }

  async close(cx) {
    if (this.overlay && shared(ACCOUNTS_KEY)?.overlay === this.overlay) setShared(ACCOUNTS_KEY, null);
  }

  lang() {
    if (this.demo) return "en";
    return shared(SHARED_KEY)?.lang ?? "en";
  }

  texts() {
    return strings(this.lang());
  }

  refreshLater(cx) {
    cx.spawn(async (cx) => {
      await this.refresh(cx);
    });
  }

  async loadSettings(cx) {
    if (this.demo) return;
    let dir = `${home()}/.local/state/herdr-tower`;
    try {
      const found = await exec("sh", ["-c", 'printf %s "${XDG_STATE_HOME:-$HOME/.local/state}/herdr-tower"']);
      if (found.code === 0 && found.stdout.trim()) dir = found.stdout.trim();
    } catch {}
    this.stateDir = dir;
    const read = async (name) => {
      try {
        const r = await exec("sh", ["-c", `cat ${shellQuote(`${dir}/${name}`)} 2>/dev/null || :`]);
        return r.stdout ?? "";
      } catch {
        return "";
      }
    };
    this.command = (await read("night-city-launch")).trim() || DEFAULT_LAUNCH;
    this.modelEntries = parseModelsFile(await read("models.json"));
    cx.notify();
  }

  focusedPid() {
    const here = focused();
    const terminal = here?.terminal;
    if (!terminal) return null;
    const machine = spaces().find((space) => space.id === here.space)?.machine ?? null;
    if (machine !== null) return null;
    const pid = terminals().find((t) => t?.address === terminal)?.foreground?.pid;
    if (Number.isInteger(pid) && pid > 0) return String(pid);
    if (typeof pid === "string" && /^\d+$/.test(pid)) return pid;
    return null;
  }

  async refresh(cx) {
    if (this.demo) return;
    const L = this.texts();
    const args = [`${appHome()}/mods/night-city-accounts/cca`, "--porcelain"];
    const pid = this.focusedPid();
    if (pid) args.push(pid);
    let result;
    try {
      result = await exec("sh", args);
    } catch {
      this.readError = L.failed;
      cx.notify();
      return;
    }
    const model = parsePorcelain(result.stdout);
    attachModels(model.models, this.modelEntries);
    model.agents = (this.allAgents ?? []).filter((a) => a.installed !== false);
    this.model = model;
    this.readError = result.code === 127 && model.accounts.length === 0 ? L.failed : null;
    this.cursor = moveCursor(rowsOf(model).length, this.cursor, 0);
    cx.notify();
  }


  startPane(argv, cx) {
    if (this.demo) return;
    if (!Array.isArray(argv) || !argv.length) return;
    run("pane.split", { direction: "right", argv });
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
    cx.notify();
  }

  openAgent(name, cx) {
    if (!ACCOUNT_NAME.test(name ?? "")) return;
    this.startPane(claudeArgv(name, this.command), cx);
  }

  openCodex(name, cx) {
    const L = this.texts();
    const agent = (this.allAgents ?? []).find((a) => a?.key === "codex" && a.installed !== false);
    if (!agent || !Array.isArray(agent.run) || !agent.run.length) {
      this.error = L.noCodex;
      cx.notify();
      return;
    }
    this.startPane(codexArgv(name, agent.run), cx);
  }

  openModel(entry, cx) {
    if (!ACCOUNT_NAME.test(entry?.name ?? "")) return;
    this.startPane(modelArgv(entry), cx);
  }

  launchAgent(agent, cx) {
    if (agent?.key === "claude") {
      const entry = (this.model.models ?? []).find((model) => model.name === this.model.globalDefault);
      if (entry) this.openModel(entry, cx);
      else this.openAgent(this.model.globalDefault, cx);
    } else if (agent?.key === "codex") {
      this.openCodex(this.model.codex.active, cx);
    } else {
      this.startPane(agentArgv(agent), cx);
    }
  }

  continueAs(target, cx) {
    const argv = continueArgv(target, this.model.session, this.command);
    if (argv) this.startPane(argv, cx);
  }

  useAccount(name, cx) {
    if (this.demo) return;
    cx.spawn(async (cx) => {
      const L = this.texts();
      let result;
      try {
        result = await exec("sh", [`${appHome()}/mods/night-city-accounts/cca`, "use", name]);
      } catch {
        this.error = L.failed;
        cx.notify();
        return;
      }
      this.error = result.code === 0 ? null : errorLine(result, L.failed);
      await this.refresh(cx);
    });
  }

  useCodex(name, cx) {
    if (this.demo) return;
    cx.spawn(async (cx) => {
      const L = this.texts();
      let result;
      try {
        result = await exec("sh", [`${appHome()}/mods/night-city-accounts/cca`, "codex", "use", name]);
      } catch {
        this.error = L.failed;
        cx.notify();
        return;
      }
      this.error = result.code === 0 ? null : errorLine(result, L.failed);
      await this.refresh(cx);
    });
  }

  runRow(row, cx) {
    if (!row) return;
    if (row.kind === "agent") this.launchAgent(row.agent, cx);
    else if (row.kind === "account") this.useAccount(row.account.name, cx);
    else if (row.kind === "codex") this.useCodex(row.account.name, cx);
    else if (row.kind === "model") this.useAccount(row.model.name, cx);
    else if (row.kind === "command") this.startEdit({ kind: "command", value: this.command }, cx);
    else if (row.kind === "add") this.startEdit({ kind: `add-${row.target}` }, cx);
    else if (row.kind === "continue") this.continueAs(row.target, cx);
  }

  /** Starts the rename a pencil starts; false for a row that has none. */
  renameRow(row, cx) {
    if (row?.kind === "account") {
      this.startEdit({ kind: "rename", key: row.account.name, value: row.account.label ?? "", original: row.account.label ?? "" }, cx);
    } else if (row?.kind === "codex") {
      this.startEdit({ kind: "rename", key: `codex:${row.account.name}`, value: row.account.label ?? "", original: row.account.label ?? "" }, cx);
    } else if (row?.kind === "model") {
      this.startEdit({ kind: "rename", key: row.model.name, value: row.model.label ?? "", original: row.model.label ?? "" }, cx);
    } else return false;
    return true;
  }

  startEdit(options, cx) {
    if (this.demo) return;
    const L = this.texts();
    const isAdd = String(options.kind).startsWith("add-");
    const placeholder = options.placeholder ?? (options.kind === "rename" ? L.rename : isAdd ? L.name : "");
    const state = InputState.new({ placeholder, value: options.value ?? "" });
    const edit = { ...options, state, second: null };
    if (options.kind === "add-model") {
      edit.second = InputState.new({ placeholder: L.start, value: "" });
      edit.second.on("submit", (_event, cx) => cx.spawn(async (cx) => this.submitEdit(cx)));
    }
    edit.state.on("submit", (_event, cx) => cx.spawn(async (cx) => this.submitEdit(cx)));
    this.edit = edit;
    this.error = null;
    const focus = state;
    cx.timer.after(40, () => focus.focus());
    cx.notify();
  }

  cancelEdit(cx) {
    this.edit = null;
    this.error = null;
    cx.timer.after(20, () => this.handle.focus());
    cx.notify();
  }

  refocus(cx) {
    cx.timer.after(20, () => this.handle.focus());
  }

  async submitEdit(cx) {
    if (this.demo) return;
    const edit = this.edit;
    if (!edit) return;
    const L = this.texts();
    const value = String(edit.state.value() ?? "").trim();
    const second = String(edit.second?.value() ?? "").trim();
    const cca = `${appHome()}/mods/night-city-accounts/cca`;
    if (edit.kind === "rename") {
      if (!value && !edit.original) {
        this.cancelEdit(cx);
        return;
      }
      let result;
      try {
        result = await exec("sh", [cca, "--porcelain-rename", edit.key, value]);
      } catch {
        this.error = L.failed;
        cx.notify();
        return;
      }
      if (result.code !== 0) {
        this.error = errorLine(result, L.failed);
        cx.notify();
        return;
      }
      this.edit = null;
      this.error = null;
      await this.refresh(cx);
      this.refocus(cx);
      return;
    }
    if (edit.kind === "command") {
      const next = value || DEFAULT_LAUNCH;
      const dir = this.stateDir ?? `${home()}/.local/state/herdr-tower`;
      const file = `${dir}/night-city-launch`;
      try {
        const r = await exec("sh", ["-c", `mkdir -p ${shellQuote(dir)} && printf '%s\\n' ${shellQuote(next)} > ${shellQuote(file)}`]);
        if (r.code !== 0) {
          this.error = errorLine(r, L.failed);
          cx.notify();
          return;
        }
      } catch {
        this.error = L.failed;
        cx.notify();
        return;
      }
      this.command = next;
      this.edit = null;
      await this.refresh(cx);
      this.refocus(cx);
      return;
    }
    if (edit.kind === "add-claude") {
      if (!value) {
        this.error = L.needName;
        cx.notify();
        return;
      }
      let result;
      try {
        result = await exec("sh", [cca, "--porcelain-add", value]);
      } catch {
        this.error = L.failed;
        cx.notify();
        return;
      }
      if (result.code !== 0) {
        this.error = errorLine(result, L.failed);
        cx.notify();
        return;
      }
      this.edit = null;
      await this.refresh(cx);
      this.startPane(claudeArgv(value, this.command), cx);
      return;
    }
    if (edit.kind === "add-codex") {
      if (!value) {
        this.error = L.needName;
        cx.notify();
        return;
      }
      let result;
      try {
        result = await exec("sh", [cca, "--porcelain-add-codex", value]);
      } catch {
        this.error = L.failed;
        cx.notify();
        return;
      }
      if (result.code !== 0) {
        this.error = errorLine(result, L.failed);
        cx.notify();
        return;
      }
      const dir = String(result.stdout ?? "").trim();
      this.edit = null;
      await this.refresh(cx);
      this.startPane(codexLoginArgv(dir), cx);
      return;
    }
    if (edit.kind === "add-model") {
      if (!value) {
        this.error = L.needName;
        cx.notify();
        return;
      }
      if (!second) {
        this.error = L.needCommand;
        cx.notify();
        return;
      }
      let result;
      try {
        result = await exec("sh", [cca, "--porcelain-add-model", value, second]);
      } catch {
        this.error = L.failed;
        cx.notify();
        return;
      }
      if (result.code !== 0) {
        this.error = errorLine(result, L.failed);
        cx.notify();
        return;
      }
      this.edit = null;
      await this.loadSettings(cx);
      await this.refresh(cx);
      this.refocus(cx);
    }
  }

  keyDown(event, cx) {
    if (this.edit) {
      if (event.key === "escape") {
        this.cancelEdit(cx);
        cx.stop_propagation();
      }
      return;
    }
    const rows = rowsOf(this.model);
    const modifiers = event.modifiers ?? {};
    const plain = !modifiers.control && !modifiers.platform && !modifiers.alt;
    if (event.key === "down") {
      this.cursor = moveCursor(rows.length, this.cursor, 1);
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (event.key === "up") {
      this.cursor = moveCursor(rows.length, this.cursor, -1);
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (event.key === "enter" || (plain && event.key === "space")) {
      this.runRow(rows[this.cursor], cx);
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (plain && (event.key === "e" || event.key === "f2")) {
      if (this.renameRow(rows[this.cursor], cx)) {
        cx.stop_propagation();
        cx.notify();
      }
      return;
    }
    if (plain && event.key === "o") {
      const row = rows[this.cursor];
      if (row?.kind === "agent") this.launchAgent(row.agent, cx);
      else if (row?.kind === "account") this.openAgent(row.account.name, cx);
      else if (row?.kind === "codex") this.openCodex(row.account.name, cx);
      else if (row?.kind === "model") this.openModel(row.model, cx);
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (event.key === "escape") {
      const overlay = props()?.overlay;
      if (overlay) closeOverlay(overlay);
    }
  }


  tintFor(element, focused) {
    return element
      .border(1)
      .border_color(focused ? C.cyan : "#00000000")
      .when(focused, (el) => el.bg("#ffffff0d"))
      .hover((el) => el.bg("#ffffff0d"));
  }

  sectionLabel(text) {
    return div().h(24).mt(6).flex().items_center().gap(8).flex_none()
      .child(div().text_size(11).font_family(MONO).text_color(C.ink3).child(text))
      .child(div().flex_1().h(1).bg(C.line));
  }

  agentRow(row, focused, L, cx) {
    const agent = row.agent;
    const iconEl = agent.icon
      ? (agent.tint ? svg(agent.icon).w(16).h(16).text_color(C.ink2) : image(agent.icon).w(16).h(16))
      : image(icon("terminal")).w(16).h(16);
    return this.tintFor(
      div().id(row.key).h(38).rounded(8).px(10).flex().items_center().gap(10).cursor_pointer()
        .on_click((_event, cx) => this.launchAgent(agent, cx)),
      focused,
    )
      .child(iconEl.flex_none())
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_weight(600).text_color(C.ink).child(agent.name))
      .child(
        div().id(`${row.key}:new`).h(20).px(6).flex().items_center().rounded(4).cursor_pointer()
          .text_size(11).font_family(MONO).text_color(C.cyan)
          .hover((el) => el.underline())
          .on_click((_event, cx) => {
            cx.stop_propagation();
            this.launchAgent(agent, cx);
          })
          .child(L.newPane),
      );
  }

  lamp(active) {
    return active
      ? dot(C.mustard, 10)
      : div().flex_none().w(10).h(10).rounded(10).border(1).border_color(C.line2);
  }

  displayName(account, L) {
    return account.label || (account.name === "default" ? L.systemDefault : account.name);
  }

  nameLine(account, current, L) {
    return div().flex().items_center().gap(2).min_w(0)
      .child(div().flex_none().text_size(13).font_weight(600).text_color(C.ink).child(this.displayName(account, L)))
      .when(current, (el) => el.child(div().flex_none().text_size(11).text_color(C.cyan).child(L.thisPane)));
  }

  pencil(key, label) {
    return div().id(`rename:${key}`).w(20).h(20).flex_none().flex().items_center().justify_center()
      .rounded(4).cursor_pointer().hover((el) => el.bg("#ffffff14"))
      .on_click((_event, cx) => {
        cx.stop_propagation();
        this.startEdit({ kind: "rename", key, value: label ?? "", original: label ?? "" }, cx);
      })
      .child(svg(icon("pencil")).w(12).h(12).text_color(C.ink3));
  }

  editInput(state, width) {
    const input = Input.new(state).h(28).flex_none().rounded(6).border(1).border_color(C.cyan)
      .bg(C.well).text_size(12).text_color(C.ink).px(6);
    return width ? input.w(width) : input.flex_1();
  }

  usageLine(entry, lang) {
    const rows = [];
    if (entry.five) rows.push({ label: "5h", win: entry.five, tint: "cyan" });
    if (entry.seven) rows.push({ label: "week", win: entry.seven, tint: "mustard" });
    if (entry.fable) rows.push({ label: "fable", win: entry.fable, tint: "pink" });
    const now = Date.now();
    return rows.map((item) =>
      div().h(16).flex().items_center().gap(8)
        .child(div().w(40).flex_none().text_size(11).font_family(MONO).text_color(C.ink3).child(item.label))
        .child(segs(item.win.used, 16, item.tint, 8, 10).flex_none())
        .child(div().w(36).flex_none().text_right().text_size(11).font_family(MONO).text_color(C.ink2)
          .child(`${Math.round(item.win.used * 100)}%`))
        .child(div().flex_1().text_right().text_size(11).font_family(MONO).text_color(C.ink3)
          .child(remaining(item.win.reset, now, lang))));
  }

  accountRow(row, focused, L, lang) {
    const account = row.account;
    const active = account.name === this.model.globalDefault;
    const current = account.name === this.model.current;
    const editing = this.edit?.kind === "rename" && this.edit.key === account.name;
    const body = editing
      ? this.editInput(this.edit.state, 180)
      : div().flex_1().min_w(0).flex().flex_col()
        .child(this.nameLine(account, current, L))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_family(MONO).text_color(C.ink3)
          .child(account.email || ""));
    const element = div().id(row.key).rounded(8).pt(8).pb(8).pl(34).pr(10).flex().flex_col().gap(4)
      .when(!editing, (el) => el.cursor_pointer())
      .when(!editing, (el) => el.on_click((_event, cx) => this.useAccount(account.name, cx)));
    const framed = this.tintFor(element, focused);
    return framed
      .child(div().flex().items_center().gap(8)
        .child(this.lamp(active))
        .child(image(neonIcon("user", active ? "mustard" : "violet")).w(20).h(20).flex_none())
        .child(body)
        .child(this.pencil(account.name, account.label)))
      .children(this.usageLine(account.usage ?? {}, lang));
  }

  codexRow(row, focused, L, lang) {
    const account = row.account;
    const active = account.name === this.model.codex.active;
    const editing = this.edit?.kind === "rename" && this.edit.key === `codex:${account.name}`;
    const body = editing
      ? this.editInput(this.edit.state, 180)
      : div().flex_1().min_w(0).flex().flex_col()
        .child(this.nameLine(account, false, L))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_family(MONO).text_color(C.ink3)
          .child(account.email || ""));
    const element = div().id(row.key).rounded(8).pt(8).pb(8).pl(34).pr(10).flex().flex_col().gap(4)
      .when(!editing, (el) => el.cursor_pointer())
      .when(!editing, (el) => el.on_click((_event, cx) => this.useCodex(account.name, cx)));
    const framed = this.tintFor(element, focused);
    return framed
      .child(div().flex().items_center().gap(8)
        .child(this.lamp(active))
        .child(image(neonIcon("terminal", active ? "mustard" : "violet")).w(20).h(20).flex_none())
        .child(body)
        .child(this.pencil(`codex:${account.name}`, account.label)))
      .children(this.usageLine(account.usage ?? {}, lang));
  }

  modelRow(row, focused, L, lang) {
    const entry = row.model;
    const active = entry.name === this.model.globalDefault;
    const current = entry.name === this.model.current;
    const editing = this.edit?.kind === "rename" && this.edit.key === entry.name;
    const body = editing
      ? this.editInput(this.edit.state, 180)
      : div().flex_1().min_w(0).flex().flex_col()
        .child(this.nameLine(entry, current, L))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_family(MONO).text_color(C.ink3)
          .child(entry.command ?? ""));
    const element = div().id(row.key).rounded(8).pt(8).pb(8).pl(34).pr(10).flex().flex_col().gap(4)
      .when(!editing, (el) => el.cursor_pointer())
      .when(!editing, (el) => el.on_click((_event, cx) => this.useAccount(entry.name, cx)));
    const framed = this.tintFor(element, focused);
    return framed
      .child(div().flex().items_center().gap(8)
        .child(this.lamp(active))
        .child(image(neonIcon("bolt", active ? "mustard" : "violet")).w(20).h(20).flex_none())
        .child(body)
        .child(
          div().id(`${row.key}:new`).h(20).px(6).flex_none().flex().items_center().rounded(4).cursor_pointer()
            .text_size(11).font_family(MONO).text_color(C.cyan)
            .hover((el) => el.underline())
            .on_click((_event, cx) => {
              cx.stop_propagation();
              this.openModel(entry, cx);
            })
            .child(L.newPane),
        )
        .child(this.pencil(entry.name, entry.label)))
      .children(this.usageLine(entry.usage ?? {}, lang));
  }

  commandRow(focused, L, cx) {
    const editing = this.edit?.kind === "command";
    const element = div().id("command").h(28).rounded(8).pl(20).pr(10).flex().items_center().gap(8)
      .when(!editing, (el) => el.cursor_pointer())
      .when(!editing, (el) => el.on_click((_event, cx) => this.startEdit({ kind: "command", value: this.command }, cx)));
    const framed = this.tintFor(element, focused);
    return framed
      .child(svg(icon("terminal")).w(12).h(12).flex_none().text_color(C.ink3))
      .child(div().flex_none().text_size(12).text_color(C.ink2).child(L.command))
      .child(editing
        ? this.editInput(this.edit.state, null)
        : div().flex_1().min_w(0).truncate().text_size(11.5).font_family(MONO).text_color(C.ink3).child(this.command));
  }

  addLabel(target, L) {
    if (target === "claude") return `+ ${L.addClaude}`;
    if (target === "codex") return `+ ${L.addCodex}`;
    return `+ ${L.addCustom}`;
  }

  addRow(row, focused, L, cx) {
    if (this.edit?.kind === `add-${row.target}`) return this.addForm(row.target, L);
    return this.tintFor(
      div().id(row.key).h(28).rounded(8).pl(20).pr(10).flex().items_center().gap(8).cursor_pointer()
        .on_click((_event, cx) => this.startEdit({ kind: `add-${row.target}` }, cx)),
      focused,
    )
      .child(svg(icon("plus")).w(12).h(12).flex_none().text_color(C.ink3))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(C.ink2).child(this.addLabel(row.target, L)));
  }

  addForm(target, L) {
    if (target === "model") {
      return div().flex().flex_col().gap(6).pl(20).pr(10).py(4)
        .child(this.editInput(this.edit.state, null))
        .child(this.editInput(this.edit.second, null))
        .child(div().text_size(11).font_family(MONO).text_color(C.ink3).child(L.hintCustom));
    }
    return div().flex().items_center().gap(8).h(28).pl(20).pr(10)
      .child(svg(icon("plus")).w(12).h(12).flex_none().text_color(C.ink3))
      .child(this.editInput(this.edit.state, null));
  }

  continueRow(row, focused, L, cx) {
    const target = row.target;
    const isModel = target.kind === "model";
    return this.tintFor(
      div().id(row.key).h(28).rounded(8).pl(20).pr(10).flex().items_center().gap(8).cursor_pointer()
        .on_click((_event, cx) => this.continueAs(target, cx)),
      focused,
    )
      .child(image(neonIcon(isModel ? "bolt" : "user", "cyan")).w(16).h(16).flex_none())
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(C.ink)
        .child(target.label || (target.name === "default" ? L.systemDefault : target.name)))
      .child(div().text_size(11).font_family(MONO).text_color(C.ink3).child(L.newPane));
  }

  hintFor(row, L) {
    if (!row) return "";
    if (row.kind === "agent") return L.hintAgent;
    if (row.kind === "account") return L.hintAccount;
    if (row.kind === "codex") return L.hintCodex;
    if (row.kind === "model") return L.hintModel;
    if (row.kind === "command") return L.hintCommand;
    if (row.kind === "add") return L.hintAdd;
    if (row.kind === "continue") return L.hintContinue;
    return "";
  }

  render(cx) {
    const model = this.model ?? emptyModel();
    const lang = this.lang();
    const L = strings(lang);
    const rows = rowsOf(model);
    const focusKey = rows[this.cursor]?.key ?? null;
    const isFocused = (row) => row.key === focusKey;
    const missing = (this.allAgents ?? []).filter((a) => a.installed === false && a?.name);

    const list = [];
    const indexOf = new Map();
    const pushRow = (row, element) => { indexOf.set(row.key, list.length); list.push(element); };
    const agents = rows.filter((row) => row.kind === "agent");
    if (agents.length) {
      list.push(this.sectionLabel(L.agents));
      for (const row of agents) pushRow(row, this.agentRow(row, isFocused(row), L, cx));
      if (missing.length) {
        list.push(div().h(18).flex().items_center().pl(10)
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(C.ink3)
            .child(L.notInstalled(missing.map((a) => a.name).join(", ")))));
      }
    }

    list.push(this.sectionLabel(L.claude));
    for (const row of rows.filter((r) => r.kind === "account")) {
      pushRow(row, this.accountRow(row, isFocused(row), L, lang));
    }
    const commandRow = rows.find((r) => r.kind === "command") ?? {};
    pushRow(commandRow, this.commandRow(isFocused(commandRow), L, cx));
    for (const row of rows.filter((r) => r.kind === "add" && r.target === "claude")) {
      pushRow(row, this.addRow(row, isFocused(row), L, cx));
    }

    list.push(this.sectionLabel(L.codex));
    for (const row of rows.filter((r) => r.kind === "codex")) {
      pushRow(row, this.codexRow(row, isFocused(row), L, lang));
    }
    for (const row of rows.filter((r) => r.kind === "add" && r.target === "codex")) {
      pushRow(row, this.addRow(row, isFocused(row), L, cx));
    }

    list.push(this.sectionLabel(L.custom));
    for (const row of rows.filter((r) => r.kind === "model")) {
      pushRow(row, this.modelRow(row, isFocused(row), L, lang));
    }
    for (const row of rows.filter((r) => r.kind === "add" && r.target === "model")) {
      pushRow(row, this.addRow(row, isFocused(row), L, cx));
    }

    const continueRows = rows.filter((r) => r.kind === "continue");
    if (continueRows.length) {
      list.push(this.sectionLabel(L.continueAs));
      for (const row of continueRows) pushRow(row, this.continueRow(row, isFocused(row), L, cx));
    }
    const cursorKey = rows[this.cursor]?.key ?? null;
    if (cursorKey !== this.scrollKey) {
      this.scrollKey = cursorKey;
      const at = indexOf.get(cursorKey);
      if (this.scroll && at != null) this.scroll.scroll_to_item(at);
    }

    const error = this.error || this.readError;
    const hint = error || this.hintFor(rows[this.cursor], L);

    return div().id("night-city-accounts").relative().w(460).bg(C.card)
      .border(POPUP_BORDER).border_color(C.line2).rounded(14).p(POPUP_PAD)
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.keyDown(event, cx))
      .child(gradient("#1d1838", "#120e25", 160))
      .child(
        div().flex().flex_col()
          .child(
            div().h(POPUP_HEADER_H).flex_none().flex().items_center().justify_between()
              .child(image(`${UI_ART}signs/accounts.svg`).w(101).h(35))
              .child(kbd("esc")),
          )
          .child(
            div().flex().flex_col().max_h(LIST_MAX_H).overflow_y_scrollbar().track_scroll(this.scroll).children(list),
          )
          .child(
            div().h(POPUP_FOOTER_H).flex_none().flex().items_center().text_size(11)
              .text_color(error ? C.pink : C.ink3)
              .child(hint ?? ""),
          ),
      );
  }
}
