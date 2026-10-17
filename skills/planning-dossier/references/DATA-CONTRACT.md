# Renderer data contract

Read this file only while you prepare renderer input. [`schemas/round.schema.json`](../schemas/round.schema.json) is the exact contract, and `finalize` enforces it. This file explains what the fields mean. All text from the user or the repository is plain text. Never put HTML in JSON fields.

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
- `outputDir`: the dossier directory, relative to the repository. The capsule and generated links use this path.
- `dossier.id`: a lowercase slug that never changes. It also keys the browser storage, so two dossiers never share saved answers.
- `language`: a BCP 47 tag. `en` and `es` have built-in interface labels. For another language, add `labels` with every key of `locales/en.json` translated. Missing labels fall back to English with the warning `i18n/fallback`.
- Decision and thread IDs are a prefix plus a number, such as `D-01` or `T-03`. Every item in the round must also appear in `currentState`.
- `branch` and `sourceRef` are optional. Leave out values you do not know instead of inventing them.

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

- `number`: a positive integer, one more than the previous round. Never change an existing number or filename.
- `kind`: `round` or `final`.
- `status`: `framing`, `awaiting-decisions`, `researching`, or `ready`.
- `evidence`, `decisions`, `threads` and `sections` may be empty arrays, but at least one of them must have content.
- A `final` round must include `finalHandoff` and have no active decisions and no open `blocker` or `material` threads.

### Evidence

```json
{
  "title": "Existing optimistic mutation",
  "detail": "The cache already reconciles temporary IDs after create succeeds.",
  "refs": ["apps/web/hooks/useCreateTask.ts:41", "packages/api/tasks.ts:create"]
}
```

Give exact paths, line numbers, symbols, routes, commands, issues or documentation references when you know them.

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
- `recommendation`: one option ID. The page highlights it but never selects it.
- Give 2 to 4 distinct options. Every option needs all the fields shown. An array may be empty only when it does not apply.

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
- The user must choose a disposition for each open thread. Blocked threads appear on the page but are disabled.
- Deferred threads require `reason`, `impact`, and `reactivation`.
- Resolved and discarded threads require a short `resolution`.

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
- Row keys must match the column keys, and row values must be scalars.
- `flow` draws a straight line of steps. For anything that branches or loops, use a table or prose.

### Final handoff

```json
{
  "title": "Implementation handoff",
  "instruction": "Read the final dossier, implement in phase order, and verify every acceptance criterion.",
  "startWith": "Phase 01: schema and API contract"
}
```

`finalHandoff` belongs directly under `round` and is required only for `kind: final`.

## Current state

The index holds a short ledger, not a copy of the round:

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

A ledger item's `status` is `open`, `blocked`, `decided`, `resolved`, `deferred` or `discarded`. Every status except `open` requires an `outcome`.

## Continuation invariants

- Keep the dossier ID and output directory.
- Increment the last manifest round by exactly one.
- Carry every earlier ledger item forward. Update it, never drop it.
- Number new IDs upward from the highest one used. Never reuse an ID for something else.
- A round file records the state at that round. Only `index.html` changes later.
