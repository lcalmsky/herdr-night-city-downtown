// Invented plates and account meters for a layout that asks with props { demo: true }. The
// names follow the street's demo sessions (mods/night-city-street/demo.js), so a picture shows
// no real space, ticket or account.
export const demoLang = "en";

/** Whether an opened session's name shares a word with an invented plate, so the plate can read as the current one. */
export function demoMatch(entry, name) {
  const words = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const mine = new Set(words(entry));
  return words(name).some((word) => mine.has(word));
}

const space = (id, name, active = false) => ({ id, name, active, tabs: [] });

export function demoGroups() {
  return [
    {
      key: "harbor-api", name: "harbor-api",
      spaces: [
        space("demo-hbr-141", "hbr-141-rollout"),
        space("demo-hbr-138", "hbr-138-reindex", true),
        space("demo-hbr-142", "hbr-142-ocr-regression"),
        space("demo-hbr-139", "hbr-139-review-fixes"),
      ],
    },
    {
      key: "help-desk", name: "help-desk",
      spaces: [space("demo-hd-137", "hd-137-faq-review"), space("demo-hd-140", "hd-140-inbox-filter")],
    },
    {
      key: "night-city", name: null,
      spaces: [space("demo-downtown-layout", "downtown-layout"), space("demo-weekly-notes", "weekly-notes")],
    },
  ];
}

export function demoCast() {
  return [
    { id: "demo-x1", who: "suit", status: "needs", name: "Rollout approval", ticket: "HBR-141", space: "demo-hbr-141" },
    { id: "demo-x2", who: "hoodie", status: "working", name: "Search reindex", ticket: "HBR-138", space: "demo-hbr-138" },
    { id: "demo-x3", who: "dress", status: "working", name: "OCR regression", ticket: "HBR-142", space: "demo-hbr-142" },
    { id: "demo-x4", who: "kid", status: "done", name: "Review fixes", ticket: "HBR-139", space: "demo-hbr-139" },
    { id: "demo-x5", who: "shopper", status: "needs", name: "FAQ draft review", ticket: "HD-137", space: "demo-hd-137" },
    { id: "demo-x6", who: "phone", status: "working", name: "Inbox filter", ticket: "HD-140", space: "demo-hd-140" },
    { id: "demo-x7", who: "puffer", status: "working", name: "Downtown layout", ticket: null, space: "demo-downtown-layout" },
    { id: "demo-x8", who: "skirt", status: "idle", name: "Weekly notes", ticket: null, space: "demo-weekly-notes" },
  ];
}

export function demoUsage() {
  return {
    current: "studio", claudeDefault: "studio", codexActive: "default",
    accounts: [
      { name: "studio", label: null, five: 0.42, week: 0.68, fable: 0.55 },
      { name: "home", label: null, five: 0.13, week: 0.31, fable: 0.78 },
    ],
    codex: [],
  };
}
