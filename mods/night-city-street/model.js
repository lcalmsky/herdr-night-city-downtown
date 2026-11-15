// What the street knows about sessions, with no drawing in it: scan parsing, status, urgency
// order, who lives in which building, search, the visit history and the terminal text size.
import { STATUS } from "./neon.js";

export const STALL_MS = 10 * 60 * 1000;
export const ASIDE_MS = 10 * 60 * 1000;
export const STEP_ROWS = 5;
export const MAX_CAST = 64; // PER_BLOCK (16) sessions per block × MAX_BLOCKS (4), so every home can be lived in
export const HISTORY_MAX = 50;
export const TERM_FONT = 14, TERM_FONT_MIN = 8, TERM_FONT_MAX = 32;
export const WHO = ["suit", "dress", "hoodie", "shopper", "phone", "kid", "puffer", "skirt"];
export const BUILDINGS = 8;

const KEY_RE = /(?:^|[^A-Za-z0-9])((?:cas|imio|ieis)-\d{1,5})(?![0-9])/i;

export function parseScan(output) {
  const sessions = [];
  let meta = null;
  for (const line of String(output ?? "").split("\n")) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.t === "s" && typeof value.sessionId === "string" && value.sessionId.length) sessions.push(value);
    else if (value?.t === "meta") meta = value;
  }
  return { sessions, meta };
}

// A session handed to a background job shows once, as the job, in the terminal it was started from.
export function foldHandoffs(sessions) {
  const jobs = new Map(sessions.filter((raw) => raw.kind === "bg" && raw.jobId).map((raw) => [raw.jobId, raw]));
  const heirs = new Map();
  for (const old of sessions) {
    const job = old.kind !== "bg" && old.parkedJobId ? jobs.get(old.parkedJobId) : null;
    if (job && !heirs.has(job)) heirs.set(job, old);
  }
  if (!heirs.size) return sessions;
  const replaced = new Set(heirs.values());
  return sessions.filter((raw) => !replaced.has(raw)).map((raw) => {
    const old = heirs.get(raw);
    return old ? { ...raw, where: old.where ?? raw.where, deadhd: raw.deadhd ?? old.deadhd } : raw;
  });
}

export const liveOf = (terminals) => (terminals ?? []).filter((t) => t.state === "live" && !String(t.address).includes("/"));

const folder = (path) => String(path ?? "").replace(/\/+$/, "");

// The Herdr terminal a scanned session runs in: by its foreground pid, else by its terminal id and folder.
export function terminalOf(raw, live) {
  const byPid = live.find((t) => raw.pid != null && Number(t.foreground?.pid) === Number(raw.pid));
  if (byPid) return byPid;
  const id = raw.where?.terminalId;
  const terminal = id ? live.find((t) => t.address === id) : null;
  if (!terminal || !raw.cwd) return null;
  return [terminal.foreground?.cwd, terminal.cwd].filter(Boolean).map(folder).includes(folder(raw.cwd)) ? terminal : null;
}

/** The item whose scanned session names the focused terminal or pane; the street marks that walker. */
export function focusMatch(items, where) {
  const terminal = where?.terminal ?? null, pane = where?.pane ?? null;
  if (terminal == null && pane == null) return null;
  const found = (items ?? []).find((item) => {
    const at = item.raw?.where;
    if (!at) return false;
    return (terminal != null && at.terminalId === terminal) || (pane != null && at.paneId === pane);
  });
  return found?.id ?? null;
}

export function ticketOf(text) {
  const match = String(text ?? "").match(KEY_RE);
  return match ? match[1].toUpperCase() : null;
}

export function placeOf(cwd) {
  const parts = String(cwd ?? "").split("/").filter(Boolean);
  const leaf = parts.at(-1) ?? null;
  return { key: ticketOf(leaf) ?? ticketOf(parts.at(-2)), label: leaf };
}

export function firstSentence(text, max = 90) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const end = flat.search(/[.!?。](\s|$)/);
  const cut = end >= 0 && end < max ? flat.slice(0, end + 1) : flat;
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

export function topicOf(raw, objectives, key) {
  const id = raw.identity ?? {};
  return (key && objectives?.[key]) || id.handoff || firstSentence(id.thread?.topic) || id.paste || firstSentence(id.firstPrompt) || null;
}

// wait: the person's turn. stall: busy with nothing running and nothing said for STALL_MS.
export function bucketOf(raw, now, agentBlocked = false) {
  if (agentBlocked) return "wait";
  if (raw.status === "waiting") return "wait";
  if (raw.status === "busy") {
    const quiet = raw.lastMeaningfulAt && now - raw.lastMeaningfulAt > STALL_MS;
    return !(raw.background?.total > 0) && quiet ? "stall" : "working";
  }
  if (raw.status === "shell") return (checklistOf(raw)?.blocked ?? 0) > 0 ? "wait" : "working";
  if (raw.status === "idle") return "done";
  return "working";
}

export function checklistOf(raw) {
  const d = raw.deadhd;
  if (!d || d.off || !d.counts || !(d.total > 0)) return null;
  return { done: d.counts.done ?? 0, total: d.total, blocked: d.counts.blocked ?? 0, now: d.nowLabel ?? null, ask: d.blockedAsk ?? null };
}

const STEP_STATES = new Set(["done", "now", "side", "blocked", "left"]);

export function stepsOf(raw) {
  const items = raw?.deadhd?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item.label === "string" && item.label.trim())
    .map((item) => ({ label: item.label, state: STEP_STATES.has(item.state) ? item.state : "left" }));
}

export function stepWindow(steps) {
  const total = steps.length;
  const states = steps.map((step) => step.state);
  const first = (state) => { const at = states.indexOf(state); return at >= 0 ? at : null; };
  const focus = first("now") ?? first("side") ?? first("blocked") ?? first("left") ?? total - 1;
  return { total, focus, maxTop: Math.max(0, total - STEP_ROWS) };
}

const STATUS_OF = { wait: "needs", stall: "stalled", working: "working" };

/**
 * One item per session: scanned sessions first, then the Herdr agents the scan doesn't list.
 * `herdr`: { terminals, agents, panes, spaces } as the herdr module returns them.
 */
export function buildItems({ sessions, meta, herdr, now, seen }) {
  const live = liveOf(herdr.terminals);
  const read = new Set(seen ?? []);
  const spaceOfTab = new Map();
  for (const space of herdr.spaces ?? []) for (const tab of space.tabs ?? []) spaceOfTab.set(tab.id, space.id);
  const claimed = new Set();
  const items = [];
  for (const raw of foldHandoffs(sessions ?? [])) {
    const terminal = terminalOf(raw, live);
    if (terminal) claimed.add(terminal.address);
    const spoke = terminal ? (herdr.agents ?? []).find((a) => a.address === terminal.address) : null;
    const bucket = bucketOf(raw, now, Boolean(raw.agent && raw.agent !== "claude" && spoke?.status === "blocked"));
    const since = raw.statusUpdatedAt ?? raw.startedAt ?? null;
    const ackKey = `${raw.sessionId}+${since != null ? Math.floor(since / 1000) : "none"}`;
    const place = placeOf(raw.cwd);
    const check = checklistOf(raw);
    const pane = terminal ? (herdr.panes ?? []).find((p) => p.terminal === terminal.address) : null;
    const status = bucket === "done" ? (read.has(ackKey) ? "idle" : "done") : STATUS_OF[bucket];
    items.push({
      id: raw.sessionId, raw, status, tint: STATUS[status].tint, since, ackKey,
      name: raw.customTitle || raw.name || raw.agentName || raw.identity?.handoff || raw.deadhd?.title || place.label || raw.sessionId.slice(0, 8),
      ask: status === "needs" ? check?.ask || raw.lastSentence || raw.lastAnswer || raw.waitingFor || "" : "",
      topic: topicOf(raw, meta?.objectives, place.key),
      line: (status === "working" && raw.currentAction) || raw.lastSentence || raw.lastAnswer || null,
      ticket: place.key, place: place.label, agent: raw.agent ?? "claude", check, steps: stepsOf(raw),
      pages: (Array.isArray(raw.pages) ? raw.pages : []).filter((page) => page?.openable),
      terminal: terminal?.address ?? null, pane: pane?.pane ?? null, space: pane ? spaceOfTab.get(pane.tab) ?? null : null,
    });
  }
  for (const a of herdr.agents ?? []) {
    if (claimed.has(a.address) || a.program?.key === "claude" || a.app === "claude-code") continue;
    const ackKey = `agent:${a.address}+${a.seq}`;
    const status = a.status === "blocked" ? "needs" : a.status === "working" ? "working" : a.status === "done" && !read.has(ackKey) ? "done" : "idle";
    items.push({
      id: `agent:${a.address}`, raw: null, status, tint: STATUS[status].tint, since: null, ackKey,
      name: a.title || a.tab_name || a.program?.name || a.address, ask: "", topic: null, line: null,
      ticket: ticketOf(a.space_name), place: a.space_name ?? null, agent: a.program?.name ?? a.app ?? "agent", check: null, steps: [], pages: [],
      terminal: a.address, pane: a.pane ?? null, space: a.space ?? null,
    });
  }
  return items;
}

// Most urgent first: needs you (longest wait first), results (newest first), stalled, working, asleep.
export function rankOf(item, aside = null, now = 0) {
  if (item.status === "stalled" && aside && (aside[item.id] ?? 0) > now) return STATUS.working.rank;
  return STATUS[item.status].rank;
}

export function byUrgency(items, aside = null, now = 0) {
  const at = (item) => item.since ?? 0;
  return [...items].sort((a, b) => rankOf(a, aside, now) - rankOf(b, aside, now)
    || (a.status === "done" ? at(b) - at(a) : at(a) - at(b))
    || (a.id < b.id ? -1 : 1));
}

export const FILTERS = [null, "needs", "working", "stalled", "done", "idle"];

export function nextFilter(filter) {
  const at = FILTERS.indexOf(filter ?? null);
  return FILTERS[(at + 1) % FILTERS.length];
}

export function inFilter(item, filter) {
  return !filter || item.status === filter;
}

/**
 * Who each session is and which building it lives in. A session keeps both for its whole life;
 * a new one takes the least used character and the emptiest home. A kept home past `buildings`
 * is reassigned, so a shrunken street has room for everyone.
 */
export function assignSeats(seats, ids, buildings = BUILDINGS) {
  const next = new Map();
  for (const id of ids) {
    const seat = seats.get(id);
    if (seat && seat.home < buildings) next.set(id, seat);
  }
  const fewest = (count, n) => { let best = 0; for (let i = 1; i < n; i++) if ((count[i] ?? 0) < (count[best] ?? 0)) best = i; return best; };
  for (const id of ids) {
    if (next.has(id)) continue;
    const who = [], home = [];
    for (const seat of next.values()) { who[seat.who] = (who[seat.who] ?? 0) + 1; home[seat.home] = (home[seat.home] ?? 0) + 1; }
    next.set(id, { who: fewest(who, WHO.length), home: fewest(home, buildings) });
  }
  return next;
}

const fold = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const tokensOf = (query) => fold(query).split(/\s+/).filter(Boolean);

export function matches(item, tokens) {
  if (!tokens.length) return true;
  const fields = [item.name, item.topic, item.ticket, item.place, item.raw?.name, item.agent].filter(Boolean).map(fold);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

/** What the other night-city mods draw from: published as shared("night-city").cast. */
export function castOf(items, seats) {
  return items.map((item) => ({
    id: item.id, who: WHO[seats.get(item.id)?.who ?? 0], status: item.status, name: item.name, ticket: item.ticket,
    tint: item.tint, terminal: item.terminal, pane: item.pane, space: item.space, since: item.since,
  }));
}

export function countsOf(items) {
  const n = (status) => items.filter((item) => item.status === status).length;
  return { needs: n("needs"), working: n("working") + n("stalled"), done: n("done") };
}

// The terminals visited, in visit order; list[at] is where the person is, the entries after it are the forward ones.
export function visitHistory(history, terminal) {
  if (!terminal || history.list[history.at] === terminal) return history;
  let list = [...history.list.slice(0, history.at + 1), terminal];
  if (list.length > HISTORY_MAX) list = list.slice(list.length - HISTORY_MAX);
  return { list, at: list.length - 1 };
}

// A closed terminal is skipped rather than ending the walk.
export function stepHistory(history, delta, alive) {
  const { list, at } = history;
  for (let i = at + delta; i >= 0 && i < list.length; i += delta) {
    if (alive.has(list[i]) && list[i] !== list[at]) return { history: { list, at: i }, target: list[i] };
  }
  return { history, target: null };
}

export function nextSettings(person, command, shown = TERM_FONT) {
  const next = { ...person };
  if (command === "font_reset") {
    delete next.font_size;
    next.zoom = 1;
    return next;
  }
  const d = command === "font_in" ? 1 : command === "font_out" ? -1 : 0;
  if (!d) return null;
  const now = Number(next.font_size ?? shown) || TERM_FONT;
  next.font_size = Math.max(TERM_FONT_MIN, Math.min(TERM_FONT_MAX, Math.round(now) + d));
  return next;
}

export function cycle(order, sel, delta = 1) {
  if (!order.length) return null;
  const at = order.findIndex((item) => item.id === sel);
  if (at < 0) return order[delta > 0 ? 0 : order.length - 1].id;
  return order[(at + delta + order.length) % order.length].id;
}
