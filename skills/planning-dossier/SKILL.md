---
name: planning-dossier
description: Creates an interactive, phased HTML dossier for planning software projects.
disable-model-invocation: true
---

# Planning dossier

Plan software work as a dossier backed by evidence from the repository. This skill produces HTML planning files and never implements product code.

## 1. Set up the dossier

Read the request, the repository conventions and any existing planning files. If the user gives a continuation capsule or points to a dossier's `index.html`, reuse that dossier. Otherwise use the repository's plan directory, or `docs/plans/<project-slug>/` if it has none.

Answer factual questions from the repository instead of asking the user. Read [THREAD-LENSES.md](references/THREAD-LENSES.md) while you map the work. This step is done when every lens that applies has a concrete finding or a stated reason why it does not apply, and every material unknown has an ID, a criticality, a dependency and a current state.

## 2. Build the current decision frontier

For a new dossier, describe the objective, scope, evidence, a first implementation outline and every known loose thread. For a continuation, read `index.html` and the round the capsule came from. Reject the capsule as stale if the index names a newer current round.

Show only decisions whose dependencies are resolved. Put independent decisions in the same frontier and list later questions as blocked threads. Give each decision 2 to 4 options that differ in substance, and recommend one without preselecting it.

Read [DATA-CONTRACT.md](references/DATA-CONTRACT.md) before you write renderer input. [schemas/round.schema.json](schemas/round.schema.json) is the exact contract. `en` and `es` have built-in interface labels. For another language, translate every key of [locales/en.json](locales/en.json) into `dossier.labels`. This step is done when the current-state ledger lists every decision and thread found so far.

## 3. Finalize, never write HTML by hand

Write the round input JSON to a temporary file, then run:

```text
node <skill-dir>/scripts/render.mjs finalize <input.json> --consume
```

`finalize` validates the input, renders the round and the index, verifies them, checks them in a browser and then publishes them. It prints a JSON receipt. It stages and checks everything first and publishes nothing unless every gate passes, so a failed run never uses up a round number. The browser gate opens the staged pages headless and checks the layout at 1280 px, at 390 px and in print. It answers every item and confirms that validation, autosave, restore after reload, reset and the Markdown capsule work. It needs Node 22 or later and a local Chrome, Chromium or Edge. Without them, the gate is skipped and the receipt says so.

A non-zero exit is never success. Each diagnostic has a `code`, a JSON pointer `path` into your input, a `message` and often a `fix`. Repair only what it names and rerun the same command. After 3 failed runs, stop and show the user the remaining diagnostics. A `browser/*` error usually means a bug in the template, unless it is overflow caused by your own long text. Report template bugs instead of reshaping the input to hide them.

Do not edit generated HTML. To revise a published round, create the next round.

A planning round contains a summary of the settled state plus what changed in this round. A final plan stands on its own. You may consolidate into a final plan only when no `blocker` item and no unresolved `material` item remain. Each deferred item needs a reason, an impact and a condition for reopening it.

## 4. Confirm the result

A passing receipt with the browser gate at `pass` completes verification. If the browser gate was `skipped`, open `index.html` and the new round in a browser yourself. Answer one decision, reload to check autosave, then try reset and the Markdown copy. If you cannot, tell the user nobody checked the dossier in a browser.

To re-check a published dossier, run `node <skill-dir>/scripts/render.mjs verify <dossier-dir>` and `browser-check <dossier-dir>`.

## 5. Hand off without implementing

For another planning round, return the dossier path and the open decisions. For a final plan, return the path of the final HTML and point to its implementation handoff button. Never modify product code under this skill.

The run is done when the index links the requested round, the dossier records every change to the planning state, and the user can copy the Markdown for the next agent without you repeating the plan in chat.
