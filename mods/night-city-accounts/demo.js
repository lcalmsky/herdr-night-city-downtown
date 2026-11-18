// The accounts popup a layout asks for with props { demo: true }: invented agents, accounts,
// meters and a custom command, so a capture shows no real e-mail, account or usage. Reset times
// are offsets from now, so the meters always read as counting down.
const seconds = () => Math.floor(Date.now() / 1000);
const win = (used, left, unit = 60) => ({ used, reset: seconds() + left * unit });

export function demoAgents() {
  return [
    { key: "claude", name: "Claude Code", run: ["claude"] },
    { key: "codex", name: "Codex", run: ["codex"] },
    { key: "grok", name: "Grok", run: ["grok"] },
    { key: "gemini", name: "Gemini CLI", installed: false },
    { key: "aider", name: "Aider", installed: false },
    { key: "opencode", name: "OpenCode", installed: false },
  ];
}

export function demoModel() {
  const agents = demoAgents().filter((agent) => agent.installed !== false);
  return {
    current: "studio",
    globalDefault: "studio",
    session: { id: "8f1c2d4e-5a6b-4c7d-9e0f-1a2b3c4d5e6f", cwd: "/home/demo/projects/neon-sign" },
    accounts: [
      {
        name: "studio", email: "studio@example.com", label: null, plan: "Max 20x",
        usage: { five: win(0.42, 2 * 60 + 10), seven: win(0.68, 3 * 24 * 60 + 4 * 60), fable: win(0.55, 5 * 24 * 60) },
      },
      {
        name: "home", email: "home@example.com", label: null, plan: "Max 5x",
        usage: { five: win(0.13, 4 * 60 + 40), seven: win(0.31, 5 * 24 * 60 + 2 * 60), fable: win(0.78, 6 * 24 * 60) },
      },
      {
        name: "night-shift", email: "night@example.com", label: null, plan: "Pro",
        usage: { five: win(0.87, 65), seven: win(0.52, 2 * 24 * 60), fable: win(0.19, 4 * 24 * 60) },
      },
    ],
    models: [
      {
        name: "gpt", kind: "model", command: "claude-gpt", resumable: true, label: null, resume: "--resume {id}",
        usage: { five: win(0.24, 3 * 60 + 5), seven: win(0.44, 3 * 24 * 60), fable: null },
      },
    ],
    labels: {},
    codex: {
      active: "default",
      accounts: [
        {
          name: "default", email: "codex@example.com", label: null, plan: "ChatGPT Plus",
          usage: { five: win(0.36, 1 * 60 + 50), seven: win(0.61, 4 * 24 * 60), fable: null },
        },
        {
          name: "lab", email: "lab@example.com", label: null, plan: "ChatGPT Pro",
          usage: { five: win(0.07, 4 * 60 + 15), seven: win(0.22, 6 * 24 * 60), fable: null },
        },
      ],
    },
    agents,
  };
}
