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

### remediation-report

Generates a polished, single-file HTML report from the findings of any review. The report is a deliverable document — no code is changed.

Each report contains:

- **Masthead** with scope, branch, finding count and total effort.
- **Summary verdict** plus a severity tally (Blocker / Medium / Minor).
- **Findings grouped into phases by urgency**, each with: concrete problem and impact, exact file paths with line numbers, a numbered actionable plan, effort estimate, and a verifiable acceptance criterion. Product decisions are surfaced as explicit "Decision required" blocks with a recommendation.
- **Proposed execution order**: commits grouped by surface touched, with per-commit verification.

Reports are written in the language you work in; the visual identity (warm paper, Fraunces + IBM Plex, severity badges) stays consistent across reports.

Trigger it by asking for a "remediation plan", "findings report" or "plan de corrección" as an HTML report after a review.

## Repository layout

```
skills/
└── <skill-name>/
    ├── SKILL.md        # instructions + frontmatter (name, description)
    └── ...             # optional bundled resources (templates, scripts, docs)
```

New skills are added as folders under `skills/`. Each folder is self-contained and installable on its own.

## License

MIT
