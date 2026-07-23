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

Read [DATA-CONTRACT.md](references/DATA-CONTRACT.md) before authoring renderer input. This step is complete when the input satisfies every required field and the compact current-state ledger accounts for every decision and thread discovered so far.

## 3. Render, never hand-author

Write the round input JSON to a temporary file, then run:

```text
node <skill-dir>/scripts/render.mjs --input <input.json> --consume
```

The renderer creates the immutable round and updates the mutable `index.html`. Do not edit generated HTML by hand. To revise a published round, create the next round.

A planning round contains a stable summary plus its delta. A final plan is self-contained. Consolidation is allowed only when no `blocker` or unresolved `material` item remains; deferred items need a reason, impact, and reactivation condition.

## 4. Verify the artifact

Run the structural verifier:

```text
node <skill-dir>/scripts/render.mjs --verify <dossier-dir>
```

Then open `index.html` and the new round in a real browser. Exercise keyboard focus, one decision in every disposition, validation, local autosave after reload, reset, Markdown copy, and index/previous navigation. Check mobile layout and print preview when the final plan is produced.

This step is complete only when structural verification passes and the browser-observed controls produce a continuation capsule matching the visible state.

## 5. Hand off without implementing

For another planning round, return the dossier path and the unresolved frontier. For a final plan, return the final HTML path and its implementation-handoff control. Never modify product code under this skill.

The run is complete when the requested round is linked from the index, all changed planning state is represented, and the user can copy the next-agent Markdown without receiving the plan again in chat.
