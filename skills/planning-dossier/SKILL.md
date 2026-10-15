---
name: planning-dossier
description: Creates an interactive, phased HTML dossier for planning software projects.
disable-model-invocation: true
---

# Planning Dossier

Plan software work as an evidence-backed dossier. The skill produces HTML planning artifacts; it never implements product code.

## 1. Establish the dossier

Read the request, repository conventions, and existing planning artifacts. Reuse an existing dossier when the user supplies a continuation capsule or points to its `index.html`; otherwise choose the repository's plan directory, falling back to `docs/plans/<project-slug>/`.

Resolve facts from the repository instead of asking the user. Read [THREAD-LENSES.md](references/THREAD-LENSES.md) while mapping the work. This step is complete when every applicable lens has either a concrete finding or an explicit “not applicable” reason, and every material unknown has an ID, criticality, dependency, and current state.

## 2. Build the current decision frontier

For a new dossier, frame the objective, scope, evidence, preliminary implementation shape, and every known loose thread. For a continuation, read `index.html` and the capsule's source round; reject a stale capsule when the index names a newer current round.

Expose only decisions whose dependencies are resolved. Put independent decisions in the same frontier; show later questions as blocked threads. Give each decision 2–4 materially distinct options and one recommendation, but never preselect it.

Read [DATA-CONTRACT.md](references/DATA-CONTRACT.md) before authoring renderer input; [schemas/round.schema.json](schemas/round.schema.json) is the exact contract. Interface labels exist for `en` and `es`; for another language, translate every key of [locales/en.json](locales/en.json) into `dossier.labels`. This step is complete when the compact current-state ledger accounts for every decision and thread discovered so far.

## 3. Finalize, never hand-author

Write the round input JSON to a temporary file, then run:

```text
node <skill-dir>/scripts/render.mjs finalize <input.json> --consume
```

`finalize` runs validate → render → verify → browser → publish and prints a JSON receipt. The round and index are staged and checked first; nothing is published unless every gate passes, so a failed run never burns an immutable round number. The browser gate opens the staged pages headless, checks layout at 1280 px, 390 px and print, answers every item, and confirms validation, autosave, reload restore, reset and the Markdown capsule. It needs Node 22+ and a local Chrome, Chromium or Edge; without them it is skipped and says so.

A non-zero exit is never success. Each diagnostic has a `code`, a JSON-pointer `path` into your input, a `message` and often a `fix`. Repair only what it names and rerun the same command. After 3 failed runs, stop and show the user the remaining diagnostics. `browser/*` errors other than overflow from your own long text point at a template bug: report them instead of reshaping the input.

Do not edit generated HTML. To revise a published round, create the next round.

A planning round contains a stable summary plus its delta. A final plan is self-contained. Consolidation is allowed only when no `blocker` or unresolved `material` item remains; deferred items need a reason, impact, and reactivation condition.

## 4. Confirm the artifact

A passing receipt with the browser gate `pass` completes verification. If the browser gate was `skipped`, open `index.html` and the new round in a browser yourself and exercise one decision, autosave after reload, reset and Markdown copy; if you cannot, tell the user the dossier was not checked in a browser.

`node <skill-dir>/scripts/render.mjs verify <dossier-dir>` and `browser-check <dossier-dir>` re-check an already published dossier.

## 5. Hand off without implementing

For another planning round, return the dossier path and the unresolved frontier. For a final plan, return the final HTML path and its implementation-handoff control. Never modify product code under this skill.

The run is complete when the requested round is linked from the index, all changed planning state is represented, and the user can copy the next-agent Markdown without receiving the plan again in chat.
