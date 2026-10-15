# Renderer data contract

Read this file only while preparing renderer input. [`schemas/round.schema.json`](../schemas/round.schema.json) is the exact contract and `finalize` enforces it; this file explains meaning. All user/repository text is plain text; never put HTML in JSON fields.

## Top level

```json
{
  "schemaVersion": 1,
  "outputDir": "docs/plans/comment-threads",
  "dossier": {
    "id": "comment-threads",
    "project": "Acme web",
    "title": "Comment threads",
    "objective": "Add one-level threaded comments without duplicate realtime inserts.",
    "language": "en",
    "branch": "feature/comments",
    "scope": "web, API, database",
    "sourceRef": "ISSUE-142"
  },
  "round": {},
  "currentState": {}
}
```

- `schemaVersion`: exactly `1`.
- `outputDir`: repository-relative dossier directory. The capsule and generated links use this path.
- `dossier.id`: stable lowercase slug. It also isolates browser storage.
- `language`: BCP 47 tag. `en` and `es` have built-in interface labels; for other languages add `labels` with every key of `locales/en.json` translated, otherwise labels fall back to English (warning `i18n/fallback`).
- Decision and thread IDs: prefix plus number, such as `D-01` or `T-03`. Every round item must also appear in `currentState`.
- `branch` and `sourceRef`: optional; omit unknown values rather than inventing them.

## Round

```json
{
  "number": 1,
  "slug": "architecture-frontier",
  "kind": "round",
  "date": "2026-07-17",
  "title": "Architecture frontier",
  "summary": "The repository supports two viable fan-out paths; persistence is settled.",
  "status": "awaiting-decisions",
  "evidence": [],
  "decisions": [],
  "threads": [],
  "sections": []
}
```

- `number`: positive, sequential integer. Existing numbers and filenames are immutable.
- `kind`: `round` or `final`.
- `status`: `framing`, `awaiting-decisions`, `researching`, or `ready`.
- `evidence`, `decisions`, `threads`, and `sections` may be empty arrays, but the round must contain useful content in at least one of them.
- A `final` round must have no active decisions, no open `blocker`/`material` threads, and must include `finalHandoff`.

### Evidence

```json
{
  "title": "Existing optimistic mutation",
  "detail": "The cache already reconciles temporary IDs after create succeeds.",
  "refs": ["apps/web/hooks/useCreateTask.ts:41", "packages/api/tasks.ts:create"]
}
```

Use exact paths, line numbers, symbols, routes, commands, issues, or documentation references when known.

### Decisions

```json
{
  "id": "D-01",
  "criticality": "material",
  "title": "Realtime transport",
  "question": "Which existing transport should carry comment inserts?",
  "rationale": "This determines cache reconciliation and infrastructure ownership.",
  "mode": "single",
  "recommendation": "existing-channel",
  "options": [
    {
      "id": "existing-channel",
      "label": "Existing task channel",
      "summary": "Publish comment rows on the task channel already opened by the card.",
      "tradeoffs": ["No new connection", "Broadens the channel payload union"],
      "surfaces": ["packages/realtime", "apps/web"],
      "reversibility": "medium",
      "complexity": "S",
      "uncertainty": "low"
    }
  ],
  "notesPrompt": "Constraints or corrections for this choice"
}
```

- `criticality`: `blocker`, `material`, or `watch`.
- `mode`: `single` or `multiple`.
- `recommendation`: one option ID. It is highlighted, never selected.
- Supply 2–4 distinct options. Every option needs all fields shown; arrays may be empty only when truly inapplicable.

### Threads

```json
{
  "id": "T-03",
  "criticality": "watch",
  "title": "Email digest cadence",
  "detail": "Notification batching is outside the first implementation slice.",
  "status": "blocked",
  "blockedBy": ["D-02"],
  "reactivation": "Revisit before the notification phase"
}
```

- `status`: `open`, `blocked`, `resolved`, `deferred`, or `discarded`.
- Open threads are interactive and require a disposition. Blocked threads are visible but disabled.
- Deferred threads require `reason`, `impact`, and `reactivation`.
- Resolved/discarded threads require a concise `resolution`.

### Sections and blocks

A section has `id`, `label`, `title`, optional `intro`, and `blocks`.

Supported blocks:

```json
{"type":"prose","paragraphs":["Plain text paragraph."]}
{"type":"list","title":"Outcomes","items":["First", "Second"]}
{"type":"steps","items":["Change exact symbol.", "Run exact verification."]}
{"type":"table","columns":[{"key":"phase","label":"Phase"}],"rows":[{"phase":"Schema"}]}
{"type":"cards","items":[{"title":"API","body":"Add comments.create.","badge":"Material","meta":["packages/api"]}]}
{"type":"code","label":"Verification","code":"npm test -- comments"}
{"type":"flow","nodes":[{"title":"Composer","detail":"optimistic row"},{"title":"API","detail":"persist"}]}
{"type":"callout","tone":"decision","title":"Boundary","body":"One nesting level in v1."}
```

- `tone`: `decision`, `warning`, or `success`.
- Tables must use matching column keys and scalar row values.
- `flow` is intentionally linear. Use a table or prose for non-linear relationships rather than forcing a misleading diagram.

### Final handoff

```json
{
  "title": "Implementation handoff",
  "instruction": "Read the final dossier, implement in phase order, and verify every acceptance criterion.",
  "startWith": "Phase 01 — schema and API contract"
}
```

`finalHandoff` belongs directly under `round` and is required only for `kind: final`.

## Current state

The index is a compact ledger, not a copy of the round:

```json
{
  "status": "awaiting-decisions",
  "summary": "Persistence is settled; transport and notification scope remain open.",
  "decisions": [
    {"id":"D-01","title":"Realtime transport","status":"open","outcome":""}
  ],
  "threads": [
    {"id":"T-03","title":"Email digest cadence","criticality":"watch","status":"blocked","outcome":"Blocked by D-02"}
  ]
}
```

Decision/thread `status`: `open`, `blocked`, `decided`, `resolved`, `deferred`, or `discarded`. `outcome` is required for every non-open state.

## Continuation invariants

- Preserve dossier ID and output directory.
- Increment the last manifest round by exactly one.
- Carry every prior ledger item forward; update it, never silently remove it.
- Add new IDs monotonically; never reuse an ID for a different meaning.
- The round file is a historical snapshot. Only `index.html` changes later.
