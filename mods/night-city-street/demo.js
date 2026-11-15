// Invented sessions in the shape scan.sh prints, for a layout that shows the street with no
// real work behind it (props { demo: true }): previews, screenshots, a first look.
const MIN = 60 * 1000;

const one = (now, n, cwd, status, ago, extra = {}) => ({
  t: "s", pid: null, sessionId: `demo-${n}`, cwd, name: null, kind: null, status, waitingFor: null,
  startedAt: now - 90 * MIN, updatedAt: now - ago * MIN, statusUpdatedAt: now - ago * MIN, lastMeaningfulAt: now - ago * MIN,
  identity: {}, background: { shells: 0, agents: 0, monitors: 0, total: 0 }, completed: [], deadhd: null, pages: [],
  where: { kind: null }, agent: "claude", ...extra,
});

const STEPS = ["Read the brief", "Map the scope", "Draft the plan", "Apply the changes", "Run the checks",
  "Review the diff", "Write the notes", "Watch the rollout", "Close the loop"];

const checklist = (done, total, nowLabel, blockedAsk = null) => ({
  title: null, total, counts: { done, left: total - done, now: 1, blocked: blockedAsk ? 1 : 0 }, nowLabel, blockedAsk,
  items: Array.from({ length: total }, (_, i) => {
    const label = STEPS[i % STEPS.length];
    if (i < done) return { state: "done", label };
    if (i === done) return blockedAsk ? { state: "blocked", label: nowLabel ?? label, ask: blockedAsk } : { state: "now", label: nowLabel ?? label };
    return { state: "left", label };
  }),
});

export function demoSessions(now, count = 8) {
  const templates = [
    one(now, 1, "/demo/harbor-api/hbr-141-rollout", "waiting", 2, {
      customTitle: "Rollout approval", lastSentence: "Ship v2.41.0 to production now?",
      identity: { handoff: "Waiting for the last sign-off before the production rollout" },
      deadhd: checklist(4, 7, "Production sign-off"),
      pages: [{ pageId: "p1", url: "https://example.com/rollout", label: "Rollout plan", files: [], openable: true }],
    }),
    one(now, 2, "/demo/help-desk/hd-137-faq-review", "waiting", 7, {
      customTitle: "FAQ draft review", lastSentence: "Leave out the 6 drafts that clash with policy and load the rest?",
      identity: { handoff: "6 of 42 drafts contradict the refund policy" }, deadhd: checklist(5, 6, "Loading scope"),
    }),
    one(now, 3, "/demo/harbor-api/hbr-138-reindex", "busy", 0, {
      customTitle: "Search reindex batch", currentAction: "Run · reindex --tenant-batch 12", lastSentence: "612 of 1,284 tenants are reindexed.",
      identity: { handoff: "Reindexing 1,284 tenants with the new chunk size" }, deadhd: checklist(3, 9, "Chunk size tuning"),
    }),
    one(now, 4, "/demo/harbor-api/hbr-142-ocr-regression", "busy", 1, {
      customTitle: "OCR regression run", agent: "codex", lastSentence: "Comparing 120 product images against the last release.",
      identity: { firstPrompt: "Compare OCR output for 120 product images with the previous release." }, deadhd: checklist(2, 5, "Reproducing the failures"),
    }),
    one(now, 5, "/demo/night-city/downtown-layout", "busy", 0, {
      customTitle: "Downtown layout", agent: "gemini", lastSentence: "Sketching how the camera follows a selected session.",
      identity: { firstPrompt: "Design the selection response and the camera move." }, deadhd: checklist(1, 4, "Three layout drafts"),
    }),
    one(now, 6, "/demo/help-desk/hd-140-inbox-filter", "busy", 14, {
      customTitle: "Inbox filter", lastSentence: "Running the test suite.", lastToolName: "Bash",
      identity: { handoff: "Filter the inbox by channel and assignee" }, deadhd: checklist(2, 6, "Build"),
    }),
    one(now, 7, "/demo/harbor-api/hbr-139-review-fixes", "idle", 1, {
      customTitle: "Review fixes for #812", lastSentence: "All 5 review comments are addressed and 312 tests pass.",
      identity: { handoff: "Address the review comments on pull request 812" }, deadhd: checklist(6, 6, "Done"),
      pages: [{ pageId: "p2", url: "https://example.com/review", label: "Review summary", files: [], openable: true }],
    }),
    one(now, 8, "/demo/night-city/weekly-notes", "idle", 40, {
      customTitle: "Weekly notes", lastSentence: "The notes for this week are saved.", identity: { firstPrompt: "Write up this week's notes." },
    }),
  ];
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1, round = Math.ceil(k / templates.length);
    const raw = templates[i % templates.length];
    if (round <= 1) return { ...raw, sessionId: `demo-${k}` };
    const alt = VARIANTS[i % templates.length][(round - 2) % VARIANTS[0].length];
    return { ...raw, sessionId: `demo-${k}`, customTitle: alt[0], lastSentence: alt[1], identity: { handoff: alt[2] }, cwd: `${raw.cwd}-${round}` };
  });
}

// What the copies past the first eight say, per template, so a crowded street does not repeat one question:
// [title, last sentence, topic line on the flyer].
const VARIANTS = [
  [["Release notes sign-off", "Publish the v2.41 release notes as they are?", "Release notes for v2.41 are drafted and reviewed"],
    ["Cache flush approval", "Flush the edge cache for all regions now?", "Stale prices are still cached in three regions"],
    ["Schema migration go", "Run the add-column migration on the replica first?", "The orders table needs a new currency column"],
    ["Feature flag rollout", "Turn the new checkout flag on for 10% of users?", "The new checkout passed QA on staging"]],
  [["Macro wording review", "Keep the friendlier tone for the 12 refund macros?", "12 refund macros were rewritten in a friendlier tone"],
    ["Tag cleanup", "Merge the 9 duplicate tags into their main tag?", "9 tags duplicate an existing main tag"],
    ["Auto-reply rules", "Pause the weekend auto-reply while the queue is short?", "The weekend queue is down to 14 open tickets"],
    ["Survey questions", "Drop the two survey questions nobody answers?", "Two survey questions get under 3% answers"]],
  [["Index warmup", "Warming 48 shards after the reindex.", "Warming the search shards after last night's reindex"],
    ["Embedding refresh", "Re-embedding 9,300 articles with the new model.", "Moving the help articles to the new embedding model"],
    ["Log compaction", "Compacting last week's request logs.", "Shrinking last week's request logs to save disk"],
    ["Backfill job", "Backfilling 2 years of order totals.", "Filling in order totals for the new report"]],
  [["Image diff run", "Comparing thumbnails against the golden set.", "Checking the new thumbnail renderer for regressions"],
    ["Locale check", "Checking 14 locales for missing strings.", "Finding untranslated strings before the release"],
    ["Load test", "Ramping to 400 requests per second.", "Testing the API under next month's expected load"],
    ["Link checker", "Following 2,180 links in the help center.", "Finding broken links in the help center"]],
  [["Tab strip polish", "Trying three widths for the active tab.", "Making the active tab easier to spot"],
    ["Night palette", "Balancing the neon colours for dark rooms.", "Tuning the night palette for dark rooms"],
    ["Sign lettering", "Tracing the script letters for the new sign.", "Drawing the lettering for a new rooftop sign"],
    ["Crowd pacing", "Tuning how fast the back row walks.", "Making the back-row crowd walk at a calmer pace"]],
  [["Webhook retries", "Running the retry tests again.", "Webhook deliveries should retry with backoff"],
    ["Search ranking", "Scoring 200 queries against the new ranking.", "Comparing the new search ranking with the old one"],
    ["CSV export", "Exporting 5,000 rows to check the encoding.", "Exported CSV files show broken accents"],
    ["Rate limiter", "Replaying a traffic spike against the limiter.", "Checking the rate limiter against a real spike"]],
  [["Docs typo sweep", "Fixed 23 typos across the setup guides.", "Clean up typos in the setup guides"],
    ["Flaky test fix", "The flaky upload test passed 50 runs in a row.", "Fix the upload test that fails one run in ten"],
    ["Dependency bump", "All packages are updated and the build is green.", "Update the packages flagged by the audit"],
    ["Accessibility pass", "Every button now has a label and focus ring.", "Give every button a label and a focus ring"]],
  [["Standup notes", "Today's standup notes are saved.", "Write up today's standup notes."],
    ["Retro summary", "The retro summary is shared with the team.", "Summarise the sprint retro."],
    ["Reading list", "This week's reading list is filed.", "File this week's reading list."],
    ["Demo script", "The demo script is ready for Friday.", "Write the script for Friday's demo."]],
];

// The last demo template has been read, so every session made from it sleeps on the back row.
export const demoSeen = (sessions) => sessions
  .filter((raw) => Number(String(raw.sessionId).replace("demo-", "")) % 8 === 0)
  .map((raw) => `${raw.sessionId}+${Math.floor(raw.statusUpdatedAt / 1000)}`);

/**
 * The street item a focused demo terminal points at: the session it took, else the one whose name
 * shares the most words with its head title. A mark published before `since` was left by an earlier
 * run and marks nothing.
 */
export function demoFocusMatch(items, focus, since = 0) {
  if (!focus || typeof focus !== "object") return null;
  const at = Number(focus.at);
  if (!Number.isFinite(at) || at < since) return null;
  const id = typeof focus.id === "string" ? focus.id : null;
  if (id && (items ?? []).some((item) => item.id === id)) return id;
  const words = (text) => new Set(String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
  const mine = words(focus.title);
  if (!mine.size) return null;
  let best = null, score = 0;
  for (const item of items ?? []) {
    const share = [...words(item.name)].filter((word) => mine.has(word)).length;
    if (share > score) { score = share; best = item.id; }
  }
  return best;
}
