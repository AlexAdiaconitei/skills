---
name: remediation-report
description: Generates self-contained HTML remediation-plan reports from review findings (security, code review, audit, tech debt), styled as an editorial dossier. Use when user asks for a correction/remediation plan as an HTML report, "findings report", "remediation plan", "plan de corrección", or wants findings from a review turned into a structured deliverable document.
---

# Remediation report

Turns review findings into a self-contained HTML report with a remediation plan. You write typed JSON and a deterministic renderer produces the HTML. Never write or edit the HTML by hand.

Creating a report changes no product code. If you apply fixes later in the same session, updating the report is part of that work (see "Updating a report after fixes").

The renderer needs Node 18 or later. The browser gate also needs Node 22 or later and a local Chrome, Chromium or Edge. Without them, the gate is skipped and the receipt says so.

## 1. Write the input

Start from a list of findings. Use a review from earlier in the conversation, or run or request one first.

Read [DATA-CONTRACT.md](references/DATA-CONTRACT.md) and write the input JSON to a temporary file. [schemas/report.schema.json](schemas/report.schema.json) is the exact contract. Before you use a field that the contract file does not show, read its definition in the schema. Set `output` to `docs/reports/remediation-<topic>.html` unless the repository has another convention for docs.

Write in the user's language and set `report.language` to it. `en` and `es` have built-in interface labels. For another language, translate every key of [locales/en.json](locales/en.json) into `report.labels`. Keep code terms in English.

## 2. Finalize

```text
node <skill-dir>/scripts/render.mjs finalize <input.json> --consume
```

`finalize` validates the input, renders the page, verifies it, checks it in a browser and then publishes it. It prints a JSON receipt. It writes nothing to `output` unless every gate passes. The browser gate opens the staged page headless at 1280 px, at 390 px and in print. It fails on horizontal overflow, broken anchors or script errors.

A non-zero exit is never success. Each diagnostic has a `code`, a JSON pointer `path` into your input, a `message` and often a `fix`. Repair only the fields it names and rerun the same command. After 3 failed runs, stop and show the user the remaining diagnostics. Warnings do not block publishing, but fix them when you can. `report/plan-length`, `report/unbalanced-code` and `report/html-in-text` point at problems in your content.

## 3. Deliver

Reply in the user's language and keep it short. Give a Markdown link to the report with a descriptive title and the absolute path, then list the phases and any "Decision required" blocks the user must answer. Do not recap commands, gates or the receipt. If the browser gate was skipped, tell the user nobody checked the report in a browser.

## Updating a report after fixes

An agent that fixes findings from an existing report MUST update the report before it yields, in the same session, after running the relevant verification.

1. Recover the input with `node <skill-dir>/scripts/render.mjs extract <report.html> --to <input.json>`.
2. For each fixed finding, set `resolution` to the code or config change and the verification you ran. Name the real files, functions, fields, migrations, routes or commands. State any deviation from the plan, accepted alternatives and caveats that remain open.
3. Set `resolution` only after the fix has landed and you ran its acceptance check or a stronger one. Never remove `acceptance`, lower a severity or delete an unresolved finding.
4. Rewrite `report.verdict` with the remediation state and date. Keep enough of the original risk to explain why the work mattered. Update `date`, `branch` or `scope` if they changed.
5. Run `finalize` again with the same `output` and `report.id`.

The renderer computes the rest. It adds the Done badges, fills the status column of the execution order and updates the counts and the colophon. A row shows Applied only when every finding in it is resolved.

## Content rules

- Group phases by urgency, not by category. A typical split is ① pre-merge blockers, ② robustness and product decisions, ③ minor polish.
- A finding title names the problem, not its category.
- `problem` says what happens and why it matters, such as impact or exploitability, in 2 to 4 sentences.
- `plan` has 2 to 5 steps that name real functions, fields, values and routes. "Improve validation" is not a step. An alternative gets its own step that starts with "Alternative only if…".
- When the fix needs a product decision, set `decision` with the options and a recommendation. The plan then describes the recommended option.
- `acceptance` must be checkable with a command, a request or a specific inspection, such as "view-source without a session contains no userId". "Works correctly" is not acceptance.
- The execution order groups findings into commits by the code they touch, not by severity, and respects dependencies. Every finding appears in exactly one commit, and each commit has a verification command or method.
- Rate severity honestly. Do not inflate minors into blockers or play blockers down. One real blocker is worth more than five inflated ones. If the source review uses more levels, map them down to these three:

| `severity` | Label | Meaning |
|---|---|---|
| `critical` | Blocker | Must not reach main or production |
| `medium` | Medium | Fix within the same branch or iteration |
| `minor` | Minor | Does not block; can go in a cleanup commit |

- Wrap every path, symbol, value and command in backticks.
- Set `stamp.tone` to `urgent` for pre-merge reviews and incidents and to `info` for informational reports.

`templates/report.html` fixes the visual design so all reports look alike. Do not restyle it per report.
