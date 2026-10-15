# skills

Agent skills by [@AlexAdiaconitei](https://github.com/AlexAdiaconitei) for [Claude Code](https://claude.com/claude-code) and other agents that support the [SKILL.md](https://agentskills.io) format.

## Installation

Install with the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
# Browse and pick skills from this repo interactively
npx skills add AlexAdiaconitei/skills

# Install a specific skill
npx skills add AlexAdiaconitei/skills --skill remediation-report

# Install globally (available in every project) instead of the current project
npx skills add AlexAdiaconitei/skills -g
```

Or install manually: copy a folder from `skills/` into your project's `.claude/skills/` (or `~/.claude/skills/` for global use).

## Available skills

| Skill | Description |
|---|---|
| [`remediation-report`](skills/remediation-report) | Turns review findings (security, code review, audit, tech debt) into a self-contained HTML remediation-plan report styled as an editorial dossier. |
| [`planning-dossier`](skills/planning-dossier) | Builds a phased, interactive HTML planning dossier with decision frontiers, compact Markdown continuation capsules, and an implementation handoff. |

### remediation-report

Generates a polished, single-file HTML report from the findings of any review. The report is a deliverable document — no code is changed.

Each report contains:

- **Masthead** with scope, branch, finding count and total effort.
- **Summary verdict** plus a severity tally (Blocker / Medium / Minor).
- **Findings grouped into phases by urgency**, each with: concrete problem and impact, exact file paths with line numbers, a numbered actionable plan, effort estimate, and a verifiable acceptance criterion. Product decisions are surfaced as explicit "Decision required" blocks with a recommendation.
- **Proposed execution order**: commits grouped by surface touched, with per-commit verification.

The agent writes the findings as typed JSON and the bundled Node renderer produces the HTML, so counts, totals, the index and the post-fix status are computed rather than hand-kept. One `finalize` command validates the input against a JSON Schema, renders, and checks the page in headless Chrome (layout at desktop, mobile and print widths, anchors, script errors) before publishing. Reports are written in the language you work in (built-in labels for English and Spanish); the visual identity (warm paper, Fraunces + IBM Plex, severity badges) stays consistent across reports.

After fixes land, `extract` recovers the report's input so the agent can mark findings resolved and re-render it in place.

Trigger it by asking for a "remediation plan", "findings report" or "plan de corrección" as an HTML report after a review.

### planning-dossier

Creates a navigable planning record for software work in a repository. Each immutable round presents the currently decidable options and accounts for blocked or deferred threads; a mutable `index.html` tracks the complete timeline.

The included Node renderer turns compact JSON into accessible, self-contained Editorial Dossier HTML. Its `finalize` command validates the input against a JSON Schema, stages the round, and exercises it in headless Chrome (answers every item, checks autosave, reload, reset, the Markdown capsule and the mobile and print layouts) before publishing. Selections autosave locally, and the copy button exports only the decision delta for the next agent. The final round produces a concise implementation handoff without changing product code.

Invoke it manually as `/planning-dossier`.

## Third-party skills

These skills are written by other authors and mirrored here so they install alongside the rest. Each folder keeps its original `LICENSE` and an `UPSTREAM.md` with the exact source commit. A weekly GitHub Action ([`sync-vendor.yml`](.github/workflows/sync-vendor.yml)) pulls upstream changes; if an upstream skill moves or disappears, the last good copy stays and an issue is opened.

| Skill | Author | Source |
|---|---|---|
| [`legacy-circuit-mockups`](skills/legacy-circuit-mockups) | GitHub | [github/awesome-copilot](https://github.com/github/awesome-copilot/tree/main/skills/legacy-circuit-mockups) |
| [`unslop`](skills/unslop) | Lauren Tan | [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack/skills/unslop) |
| [`grill-with-docs`](skills/grill-with-docs) | Matt Pocock | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |
| [`grill-me`](skills/grill-me) | Matt Pocock | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) |
| [`grilling`](skills/grilling) | Matt Pocock | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) |

To add one, append an entry to [`vendor.json`](vendor.json) (`name`, `repo`, `ref`, `path`, `license` path in the upstream repo or `null` if the folder has its own, `sha: null`) and run `node scripts/sync-vendor.mjs`. Do not edit mirrored folders by hand; the next sync overwrites them.

### Recommended, not mirrored

Too large to mirror (a full CLI with renderers and a browser test harness); install it from its own repository.

| Skill | Author | Install |
|---|---|---|
| [archify](https://github.com/tt-a1i/archify): validated architecture, workflow, sequence, ERD and other diagrams as interactive HTML | tt-a1i | `npx skills add tt-a1i/archify` |

## Repository layout

```
skills/
└── <skill-name>/
    ├── SKILL.md        # instructions + frontmatter (name, description)
    └── ...             # optional bundled resources (templates, scripts, docs)
shared/                 # renderer library: schema validator, diagnostics, i18n, headless browser
scripts/
├── sync-shared.mjs     # copies shared/ into skills/*/scripts/lib/
└── sync-vendor.mjs     # mirrors third-party skills listed in vendor.json
```

New skills are added as folders under `skills/`. Each folder is self-contained and installable on its own.

Renderer skills share code through `shared/`. A skill opts in by having a `scripts/lib/` folder; `node scripts/sync-shared.mjs` writes generated copies there so the skill still installs on its own. Edit `shared/`, never the copies; CI fails when they drift and runs every `skills/*/scripts/*.test.mjs`, including the headless browser gate.

## License

MIT
