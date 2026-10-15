---
name: remediation-report
description: Generates self-contained HTML remediation-plan reports from review findings (security, code review, audit, tech debt), styled as an editorial dossier. Use when user asks for a correction/remediation plan as an HTML report, "findings report", "remediation plan", "plan de corrección", or wants findings from a review turned into a structured deliverable document.
---

# Remediation Report

Turns review findings into a self-contained HTML report with an actionable remediation plan. You author typed JSON; a deterministic renderer produces the HTML. Never write or edit the HTML by hand.

Creating a report changes no product code. If remediation is applied later in the same session, updating the report is part of that deliverable (see Updating).

Requires Node 18+. The browser gate also needs Node 22+ and a local Chrome, Chromium or Edge; without them it is skipped and says so.

## 1. Author the input

You need a list of findings: from a review earlier in the conversation, or run or request the review first.

Read [DATA-CONTRACT.md](references/DATA-CONTRACT.md) and write the input JSON to a temporary file. [schemas/report.schema.json](schemas/report.schema.json) is the exact contract; read a definition there before using a field the contract does not show. Set `output` to `docs/reports/remediation-<topic>.html` unless the repo has another docs convention.

Write in the user's language and set `report.language` to it. `en` and `es` have built-in interface labels; for another language, translate every key of [locales/en.json](locales/en.json) into `report.labels`. Keep code terms in English.

## 2. Finalize

```text
node <skill-dir>/scripts/render.mjs finalize <input.json> --consume
```

`finalize` runs validate → render → verify → browser → publish and prints a JSON receipt. Nothing is written to `output` unless every gate passes. The browser gate opens the staged page headless at 1280 px, 390 px and in print, and fails on horizontal overflow, broken anchors or script errors.

A non-zero exit is never success. Each diagnostic has a `code`, a JSON-pointer `path` into your input, a `message` and often a `fix`. Repair only the fields it names and rerun the same command. After 3 failed runs, stop and show the user the remaining diagnostics instead of looping. Warnings do not block publishing but are worth fixing: `report/plan-length`, `report/unbalanced-code` and `report/html-in-text` point at content problems.

## 3. Deliver

Reply in the user's language, briefly: a Markdown link to the report (descriptive title, absolute path), then the phases and any "Decision required" blocks the user must answer. Do not recap commands, gates or the receipt. If the browser gate was skipped, say the report was not checked in a browser.

## Updating a report after fixes are applied

Agents that apply fixes for findings in an existing report MUST update it before yielding, in the same session, after the relevant verification has run.

1. Recover the input: `node <skill-dir>/scripts/render.mjs extract <report.html> --to <input.json>`.
2. For each fixed finding, set `resolution`: the concrete code/config change and the verification actually executed, naming real files, functions, fields, migrations, routes or commands. State plan deviations, accepted alternatives and unresolved caveats.
3. Set `resolution` only after the fix landed and its acceptance check (or a stronger one) was exercised. Never remove `acceptance`, lower a severity, or delete an unresolved finding.
4. Rewrite `report.verdict` with the remediation state and date, keeping enough of the original risk context to explain why the work mattered. Update `date`, `branch` or `scope` if they changed.
5. Run `finalize` again with the same `output` and `report.id`.

The renderer derives the rest: the Done badges, the status column of the execution order (Applied only when every finding in the row is resolved), the counts and the colophon.

## Content rules

- **Phases group by urgency**, not category. Typical: ① pre-merge blockers, ② robustness and product decisions, ③ minor polish.
- **Finding titles name the concrete problem**, not its category.
- **Problem** says what happens and why it matters (impact, exploitability) in 2-4 sentences.
- **Plan** is 2-5 concrete steps naming real functions, fields, values and routes, never "improve validation". An alternative gets its own step prefixed "Alternative only if…".
- **Decision**: when the fix needs a product decision, set `decision` with the options and a recommendation; the plan then describes the recommended option.
- **Acceptance** is verifiable: a command, a request or a concrete inspection ("view-source without a session contains no userId"), never "works correctly".
- **Execution order** groups findings into commits by surface touched, not severity, respecting dependencies. Every finding appears in exactly one commit, each with a verification command or method.
- **Honest severity**: don't inflate minors into blockers or vice versa. One real blocker is worth more than five inflated ones. Map source reviews with more levels down to three:

| `severity` | Label | Meaning |
|---|---|---|
| `critical` | Blocker | Must not reach main / production |
| `medium` | Medium | Fix within the same branch/iteration |
| `minor` | Minor | Non-blocking; groupable into a cleanup commit |

- Wrap every path, symbol, value and command in backticks.
- `stamp.tone`: `urgent` for pre-merge reviews and incidents, `info` for informational reports.

The visual design is fixed in `templates/report.html` so reports read as one family. Do not restyle it per report.
