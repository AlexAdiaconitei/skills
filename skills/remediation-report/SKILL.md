---
name: remediation-report
description: Generates self-contained HTML remediation-plan reports from review findings (security, code review, audit, tech debt), styled as an editorial dossier. Use when user asks for a correction/remediation plan as an HTML report, "findings report", "remediation plan", "plan de corrección", or wants findings from a review turned into a structured deliverable document.
---

# Remediation Report

Turns review findings into a self-contained HTML report with an actionable remediation plan. It does NOT implement code when invoked only to create a report; if remediation is applied later in the same session, updating the report is part of the remediation deliverable.

## Quick start

1. You need a list of findings (from a prior review in the conversation, or run/request the review first).
2. Read [TEMPLATE.html](TEMPLATE.html) — it contains the full CSS and the structure with slots marked `<!-- SLOT: ... -->`.
3. Write the report to `docs/reports/remediation-<topic>.html` (create the folder if missing; if the repo has another docs convention, follow it).
4. Deliver the path to the user + a summary of phases and pending decisions.

## Report language

Write the report content in the language the user is working in (their messages / the repo docs). Translate the template's fixed labels (Findings, Effort, Acceptance criterion, Decision required, etc.) to match. Keep code terms in English as-is.

## Required report structure

In this order:

1. **Masthead**: kicker (project · report type · reference ADR/PR if any), title with `<em>` on the topic, rotated stamp with the urgency context (e.g. "Pre-merge · branch"), metadata `dl` (date, branch, scope, finding count with blocker count, total effort).
2. **Summary**: one `p.lede` of 2-4 sentences — overall verdict first ("structurally sound", "needs work"), then what blocks, then the rest. Beside it, a tally with counts per severity.
3. **Table of contents (toc)**: one link per finding with id `F-NN`, short title, and severity badge.
4. **Phases** (`phase` sections numbered 01, 02…): group by urgency, not by category. Typical: ① pre-merge blockers, ② robustness + product decisions, ③ minor polish. Each phase gets a `ph-when` (when it must happen) and a 1-2 sentence `phase-intro`.
5. **Execution-order table**: last section. Proposed commits grouping findings by surface touched (not by severity), with the grouping rationale and a verification command/method per commit. Respect dependencies between findings. If the report has been updated after fixes were applied, add a final status column with a resolved/pending badge per row.
6. **Colophon**: report name · current state note. Before code changes, say "review only — no code changes applied". After remediation work, replace that with a truthful note such as "remediation applied and report updated".

## Anatomy of each finding (article.finding)

- **Header**: id `F-NN`, a title naming the concrete problem (not the category), severity badge, optional resolved badge (`<span class="sev done">Done</span>` / localized label) only after the fix is implemented and verified, effort estimate (`~15 min`, `~1 h`).
- **Problem column**: what happens AND why it matters (impact/exploitability), in 2-4 sentences. Then a **Files** list with exact paths and `:line` when known.
- **Plan column**: an `ol.steps` of 2-5 concrete, actionable steps — name real functions, fields, values and routes, never "improve validation". If a step has an alternative, make it its own step prefixed "Alternative only if…".
- **Decision block** (`div.decision`, optional): when the fix requires a product decision, lay out the options and a recommendation; retitle the plan column "Plan (recommended option)".
- **Footer**: a **verifiable** acceptance criterion — something checkable with a command, a request, or a concrete inspection ("view-source without a session contains no userId"), never "works correctly". Keep this acceptance criterion when the issue is later resolved; add a separate resolution footer instead of overwriting it.

## Updating a report after fixes are applied

Agents that apply fixes for findings covered by an existing remediation report MUST update that report before yielding, in the same session, after the relevant verification has run.

For each fixed finding:

1. Add a resolved badge in the finding header after the severity badge: `<span class="sev done">Done</span>` (translate the label, e.g. `Resuelto`).
2. Keep the original acceptance criterion footer unchanged.
3. Append a second footer immediately after it:

```html
<div class="f-foot resolution">
	<span class="tag">Resolution</span>
	<span class="crit">Concrete code/config change made, plus the verification actually executed.</span>
</div>
```

4. The resolution text must name the real files, functions, fields, migrations, routes, or commands touched. It must distinguish plan deviations, accepted alternatives, and unresolved caveats.
5. Mark a finding resolved only after the implementation landed and the acceptance check (or an equivalent stronger check) was actually exercised.

For the whole report:

- Update the summary lede with the remediation state and date (for example, "All 25 findings are remediated; each card includes the verification run"). Keep enough original risk context that the report still explains why the work mattered.
- Update the execution-order table with a status column (`<span class="sev done">Applied</span>` / localized label) when commits/groups have been completed. A row is "Applied" only when every finding in that row is resolved; otherwise leave it pending or partially applied explicitly.
- Update masthead metadata if counts, scope, branch, date, or total effort changed.
- Update the colophon so it does not falsely say "no code changes applied" after remediation has been performed.
- Do not erase unresolved findings, lower severities, or remove acceptance criteria just because a fix is planned.

## Severities

Three levels, CSS classes already defined in the template:

| Class | Label | Meaning |
|---|---|---|
| `critical` | Blocker | Must not reach main / production |
| `medium` | Medium | Fix within the same branch/iteration |
| `minor` | Minor | Non-blocking; groupable into a cleanup commit |

If the source review uses more levels, map them down to these three.

## Writing rules

- `<code>` for every path, symbol, value and command.
- Honest severity: don't inflate minors into blockers or vice versa. One real blocker is worth more than five inflated ones.
- Per-finding efforts and the masthead total must roughly add up.
- No JS libraries or local assets: self-contained HTML, Google Fonts via `<link>` only.

## Aesthetics

The template already implements the visual direction (editorial dossier: warm paper, Fraunces + IBM Plex, severity badges, hard shadows, rotated stamp). **Do not redesign it**; only adjust:

- the stamp color when the context is not urgent (green `var(--accent)` for informational reports, red `var(--critical)` for pre-merge/incidents);
- the number of tally cells to the severities present;
- animation delays if sections are added/removed.

Keep reports consistent with each other: they must read as the same family of documents.
