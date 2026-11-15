// Shared by every night-city mod. The source is shared/neon.js; tools/sync-shared.sh copies it
// into each mod folder, because a mod can only import from its own folder.
import { div, image, PathBuilder, Background } from "gpui-kit";

export const C = {
  ink: "#d8d0e2", ink2: "#9d93b8", ink3: "#6a6188",
  paper: "#1f1a36", dark: "#110d22", night: "#0a0718", pane: "#0e0b1d",
  bar: "#0d0a1c", foot: "#0b0818", card: "#171230", well: "#120e25",
  line: "#2a2348", line2: "#3a3260",
  pink: "#ec6fa2", cyan: "#5fd0e6", mustard: "#d8b25c", violet: "#a98bf0",
  window: "#f2c47c", white: "#ffffff",
};

export const ART = "mods/night-city-street/art/";
export const UI_ART = `${ART}ui/`;
export const CITY_ART = `${ART}city/`;
export const MONO = "JetBrains Mono";
export const SHARED_KEY = "night-city";
export const QUERY_KEY = "night-city.query";
export const ACCOUNTS_KEY = "night-city.accounts";

// status -> neon colour name, portrait suffix, street marker
export const STATUS = {
  needs: { tint: "pink", face: "_blocked", marker: "alert", rank: 0 },
  done: { tint: "mustard", face: "_done", marker: "done", rank: 1 },
  stalled: { tint: "mustard", face: "_tired", marker: "blocked", rank: 2 },
  working: { tint: "cyan", face: "", marker: "working", rank: 3 },
  idle: { tint: "violet", face: "_idle", marker: "idle", rank: 4 },
};

const KEY_GROUPS = {
  ko: [
    { title: "거리", rows: [
      ["Tab / ⇧Tab", "급한 순서로 다음·이전 세션"],
      ["← / →", "다음·이전 세션"],
      ["↩", "고른 세션의 pane 으로"],
      ["⇧↩", "고른 세션의 페이지 열기"],
      ["P", "가장 오래된 페이지 열기"],
      ["⌥← / ⌥→", "첫·마지막 세션"],
      ["Space / ⇧Space", "답할 세션 / 결과 세션 고르기"],
      ["M", "결과 읽음 표시"],
      ["⌫", "읽음 표시 · 멈춘 세션 치우기"],
      ["⌘Z", "읽음·치우기 되돌리기"],
      ["↓ / ↑", "단계 펼치기·접기"],
      ["⌘↩", "세션 메뉴 · ↑↓ ↩ Esc"],
      ["F", "상태 필터"],
      ["/", "세션·티켓 찾기"],
      ["Esc", "메뉴·선택·필터·찾기 지우기"],
      ["?", "키 안내"],
    ] },
    { title: "레이아웃", rows: [
      ["⌃⌥P", "키보드를 거리로"],
      ["⌃⌥/", "이 도움말 보기"],
      ["⌃⇧A", "계정·사용량"],
      ["⌘ + − 0", "터미널 글자 크기"],
      ["⌘ [ / ⌘ ]", "이전·다음 pane"],
    ] },
    { title: "탭 줄", rows: [
      ["← / →", "탭 이동"],
      ["↩ / Space", "탭 선택"],
      ["⇧← / ⇧→", "탭 순서 바꾸기"],
      ["F", "파일 패널"],
      ["C", "변경 패널"],
      ["/", "찾기 칸 (세션·티켓)"],
      ["M", "탭 메뉴"],
      ["Esc", "탭 줄에서 나가기"],
    ] },
    { title: "번호판", rows: [
      ["← / →", "번호판 이동"],
      ["↩ / Space", "공간 선택"],
      ["A", "계정"],
      ["N", "새 공간"],
      ["M", "공간 메뉴"],
      ["Esc", "번호판에서 나가기"],
    ] },
    { title: "계정 팝업", rows: [
      ["↑ / ↓", "행 이동"],
      ["↩ / Space", "행 실행"],
      ["O", "새 pane"],
      ["E / F2", "이름 바꾸기"],
      ["Esc", "닫기"],
    ] },
    { title: "편집 pane", rows: [
      ["⌘S", "저장"],
      ["⌘R", "다시 읽기"],
      ["⌘E", "코드·미리보기"],
      ["⌘O", "탭으로 열기"],
    ] },
  ],
  en: [
    { title: "Street", rows: [
      ["Tab / ⇧Tab", "Next or previous session"],
      ["← / →", "Next or previous session"],
      ["↩", "Open the session's pane"],
      ["⇧↩", "Open the session's pages"],
      ["P", "Open the oldest page"],
      ["⌥← / ⌥→", "First or last session"],
      ["Space / ⇧Space", "Pick a waiting / result session"],
      ["M", "Mark a result read"],
      ["⌫", "Read · put a stalled one aside"],
      ["⌘Z", "Undo a read or put-aside"],
      ["↓ / ↑", "Expand or collapse steps"],
      ["⌘↩", "Session menu · ↑↓ ↩ Esc"],
      ["F", "Status filter"],
      ["/", "Find a session or ticket"],
      ["Esc", "Back one layer at a time"],
      ["?", "Key help"],
    ] },
    { title: "Layout", rows: [
      ["⌃⌥P", "Keyboard to the street"],
      ["⌃⌥/", "Show this help"],
      ["⌃⇧A", "Accounts and usage"],
      ["⌘ + − 0", "Terminal text size"],
      ["⌘ [ / ⌘ ]", "Previous or next pane"],
    ] },
    { title: "Tab strip", rows: [
      ["← / →", "Move through tabs"],
      ["↩ / Space", "Select the tab"],
      ["⇧← / ⇧→", "Reorder tabs"],
      ["F", "Files panel"],
      ["C", "Changes panel"],
      ["/", "Find box (sessions, tickets)"],
      ["M", "Tab menu"],
      ["Esc", "Leave the tab strip"],
    ] },
    { title: "Plates", rows: [
      ["← / →", "Move through plates"],
      ["↩ / Space", "Select the space"],
      ["A", "Accounts"],
      ["N", "New space"],
      ["M", "Space menu"],
      ["Esc", "Leave the plates"],
    ] },
    { title: "Accounts popup", rows: [
      ["↑ / ↓", "Move through rows"],
      ["↩ / Space", "Run the row"],
      ["O", "New pane"],
      ["E / F2", "Rename"],
      ["Esc", "Close"],
    ] },
    { title: "Editor pane", rows: [
      ["⌘S", "Save"],
      ["⌘R", "Reload"],
      ["⌘E", "Code or preview"],
      ["⌘O", "Open as a tab"],
    ] },
  ],
};

const TEXT = {
  ko: {
    needs: "내 차례", done: "결과 도착", stalled: "멈춤", working: "작업 중", idle: "잠듦",
    countNeeds: "내 차례", countWorking: "작업 중", countDone: "결과",
    answer: "답하러 가기", open: "세션 열기", next: "다음", read: "읽음",
    checklist: "체크리스트", pages: (n) => `페이지 ${n}개가 열람을 기다림`,
    search: "세션·티켓 찾기", quiet: "오늘 밤 거리는 조용합니다", noMatch: "찾는 세션이 없습니다",
    accounts: "계정 · ⌃⇧A", nowhere: "Herdr·tmux·Orca 어디에도 없는 세션입니다. 터미널을 먼저 여세요",
    filters: { all: "전체", needs: "내 차례", working: "작업 중", stalled: "멈춤", done: "결과", idle: "잠듦" },
    marked: "읽음 표시했습니다 · ⌘Z 로 되돌리기",
    putAside: "10분 동안 치워 뒀습니다 · ⌘Z 로 되돌리기",
    undoneRead: "읽음 표시를 되돌렸습니다",
    undoneAside: "치우기를 되돌렸습니다",
    undo: "되돌리기", retry: "다시 시도",
    noPage: "열 페이지가 없습니다",
    noAsk: "답을 기다리는 세션이 없습니다",
    noResult: "결과가 도착한 세션이 없습니다",
    menuTitle: "세션 메뉴",
    menuGo: "세션 열기",
    menuPages: "페이지 열기",
    menuTicket: "티켓 열기",
    menuPr: "PR 열기",
    menuSteps: "체크리스트 펼치기",
    menuStop: "백그라운드 세션 멈추기",
    menuCopy: "링크 복사",
    menuEmpty: "할 수 있는 동작이 없습니다",
    stopFailed: "멈추지 못했습니다. 터미널에서 claude stop 을 실행하세요",
    stepsTitle: "단계",
    keyNote: "글자 키는 영문 입력 상태에서 동작합니다 · 한글 입력 상태에서는 입력기가 먼저 받습니다",
    stepsCount: (first, last, total) => (first === 1 && last === total ? `${total}` : `${first}–${last} / ${total}`),
    stepStates: { done: "끝남", now: "지금", blocked: "막힘", side: "옆", left: "남음" },
    pageHint: "⇧↩",
    menuHint: "⌘↩",
    keyGroups: KEY_GROUPS.ko,
  },
  en: {
    needs: "Needs you", done: "Result in", stalled: "Stalled", working: "Working", idle: "Asleep",
    countNeeds: "Needs you", countWorking: "Working", countDone: "Results",
    answer: "Go answer", open: "Open session", next: "Next", read: "Mark read",
    checklist: "Checklist", pages: (n) => `${n} page${n === 1 ? "" : "s"} waiting to be read`,
    search: "Find a session or ticket", quiet: "The street is quiet tonight", noMatch: "No session matches",
    accounts: "Accounts · ⌃⇧A", nowhere: "Not in Herdr, tmux or Orca. Open the session's terminal first",
    filters: { all: "All", needs: "Needs you", working: "Working", stalled: "Stalled", done: "Results", idle: "Asleep" },
    marked: "Marked as read · ⌘Z to undo",
    putAside: "Put aside for 10 minutes · ⌘Z to undo",
    undoneRead: "The read mark is undone",
    undoneAside: "The put-aside is undone",
    undo: "Undo", retry: "Retry",
    noPage: "No page to open",
    noAsk: "No session is waiting for you",
    noResult: "No session has a result",
    menuTitle: "Session menu",
    menuGo: "Open session",
    menuPages: "Open pages",
    menuTicket: "Open the ticket",
    menuPr: "Open the pull request",
    menuSteps: "Expand the checklist",
    menuStop: "Stop the background session",
    menuCopy: "Copy links",
    menuEmpty: "Nothing to do here",
    stopFailed: "Could not stop it. Run claude stop in a terminal",
    stepsTitle: "Steps",
    keyNote: "Letter keys work with an English input source · other input methods take them first",
    stepsCount: (first, last, total) => (first === 1 && last === total ? `${total}` : `${first}–${last} / ${total}`),
    stepStates: { done: "done", now: "now", blocked: "blocked", side: "side", left: "left" },
    pageHint: "⇧↩",
    menuHint: "⌘↩",
    keyGroups: KEY_GROUPS.en,
  },
};
export const words = (lang) => TEXT[lang] ?? TEXT.en;

/** The `pane.focus` arguments that return the keyboard to what Herdr had focused. */
export function paneTarget(now) {
  if (now?.pane) return { pane: now.pane };
  if (now?.terminal) return { terminal: now.terminal };
  return null;
}

export const tintOf = (name) => C[name] ?? C.cyan;
export const faceOf = (who, status) => `${UI_ART}panel/faces/${who}${STATUS[status]?.face ?? ""}.svg`;
export const neonIcon = (name, tint = "cyan") => `${UI_ART}icons-neon/${tint}/${name}.svg`;
export const icon = (name) => `${UI_ART}icons/${name}.svg`;

const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();
/** A layer that fills its (relative) parent with a two-colour gradient. */
export function gradient(from, to, angle = 180) {
  return window.paint_path(RECT(), Background.linear_gradient(angle, from, to)).absolute().left(0).top(0).size_full();
}

/** A keycap chip. */
export function kbd(text, color = C.ink2) {
  return div().flex_none().px(5).h(17).flex().items_center().rounded(4).border(1).border_b(2).border_color(C.line2).bg(C.card)
    .text_size(10.5).font_weight(600).font_family(MONO).text_color(color).child(text);
}

/** A row of meter segments: `value` 0..1 over `n` lamps, turning pink above 75%. */
export function segs(value, n = 8, tint = "cyan", w = 6, h = 8) {
  const on = Math.max(0, Math.min(n, Math.round((Number(value) || 0) * n)));
  const lit = value > 0.75 ? "pink" : tint;
  const row = div().flex().flex_row().flex_none().gap(2);
  for (let i = 0; i < n; i++) {
    row.child(image(`${UI_ART}panel/meter-seg-${i < on ? `on-${lit}` : "off"}.svg`).w(w).h(h).flex_none());
  }
  return row;
}

/** A status lamp: a small dot in the status colour. */
export function dot(color, size = 7) {
  return div().flex_none().w(size).h(size).rounded(size).bg(color);
}

/** A portrait in its round frame; `lit` adds the neon ring of that colour. */
export function portrait(who, status, size, lit = null) {
  const layer = (file) => image(`${UI_ART}panel/faces/${file}.svg`).absolute().left(0).top(0).w(size).h(size);
  const box = div().relative().flex_none().w(size).h(size).child(layer("frame"));
  box.child(image(faceOf(who, status)).absolute().left(0).top(0).w(size).h(size));
  if (lit) box.child(layer(`frame-lit-${lit}`));
  return box;
}

/** "3분 전" / "3m ago" style age of an epoch-ms instant. */
export function ago(at, now, lang = "en") {
  if (!at) return "";
  const s = Math.max(0, Math.floor((now - at) / 1000));
  const [n, unit] = s < 60 ? [0, "now"] : s < 3600 ? [Math.floor(s / 60), "m"] : s < 86400 ? [Math.floor(s / 3600), "h"] : [Math.floor(s / 86400), "d"];
  if (unit === "now") return lang === "ko" ? "방금" : "just now";
  if (lang === "ko") return `${n}${{ m: "분", h: "시간", d: "일" }[unit]} 전`;
  return `${n}${unit} ago`;
}

/** Text width estimate in px: Hangul and CJK are a full em, Latin about half. No measuring API exists. */
export function textWidth(text, size, bold = false) {
  let em = 0;
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    if (code >= 0x1100 && (code <= 0x11ff || (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef))) em += 1;
    else if (ch === " ") em += 0.3;
    else if (/[A-Z0-9@#%&MWmw]/.test(ch)) em += 0.66;
    else if (/[ilj.,:;'|!]/.test(ch)) em += 0.3;
    else em += 0.55;
  }
  return Math.ceil(em * size * (bold ? 1.06 : 1));
}

/** Cuts text to about `max` px, on a word boundary when one is near, never mid-syllable. */
export function clipText(text, max, size, bold = false) {
  const full = String(text ?? "").replace(/\s+/g, " ").trim();
  if (textWidth(full, size, bold) <= max) return full;
  let out = "";
  for (const ch of full) {
    if (textWidth(`${out}${ch}…`, size, bold) > max) break;
    out += ch;
  }
  const space = out.lastIndexOf(" ");
  if (space > out.length * 0.6) out = out.slice(0, space);
  return `${out.trimEnd()}…`;
}
