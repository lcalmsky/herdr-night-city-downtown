// The tabs a layout asks for with props { demo: true }: invented English names that follow the
// street's demo sessions (mods/night-city-street/demo.js), so a picture shows no real space.
export const demoLang = "en";

/** Whether an opened session's name shares a word with an invented tab, so the tab can read as the current one. */
export function demoMatch(entry, name) {
  const words = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const mine = new Set(words(entry));
  return words(name).some((word) => mine.has(word));
}

export function demoSpace() {
  return {
    id: "demo-space",
    name: "harbor-api",
    active: true,
    tabs: [
      { id: "demo-tab-rollout", name: "harbor-api · rollout", active: false, status: "blocked", settled: false },
      { id: "demo-tab-reindex", name: "harbor-api · reindex", active: true, status: "working", settled: false },
      { id: "demo-tab-faq", name: "help-desk · faq", active: false, status: "working", settled: false },
      { id: "demo-tab-layout", name: "night-city · layout", active: false, status: "done", settled: false },
    ],
  };
}
