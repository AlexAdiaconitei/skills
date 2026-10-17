# Report input contract

Read this file while you prepare renderer input. [`schemas/report.schema.json`](../schemas/report.schema.json) is the exact contract, and `finalize` enforces it. This file shows the shape of the input and what each part means.

All text fields are plain text. The only inline markup is `` `code` `` and `**bold**`. The renderer escapes anything that looks like HTML and shows it as written.

## Complete example

```json
{
  "schemaVersion": 1,
  "output": "docs/reports/remediation-session-auth.html",
  "report": {
    "id": "session-auth",
    "language": "en",
    "project": "Acme web",
    "type": "Security review",
    "reference": "PR #214",
    "title": "Remediation plan:",
    "topic": "session auth",
    "date": "2026-10-15",
    "branch": "feature/sessions",
    "scope": "`apps/api` auth middleware and session store",
    "stamp": { "text": "Pre-merge · branch", "tone": "urgent" },
    "verdict": "**Structurally sound**, but one blocker leaks session IDs to logs. Two medium findings harden expiry; the rest is polish."
  },
  "phases": [
    {
      "title": "Pre-merge blockers",
      "when": "Before merge",
      "intro": "Must be fixed before this branch reaches `main`.",
      "findings": [
        {
          "id": "F-01",
          "title": "Session ID written to request logs",
          "severity": "critical",
          "effort": "~30 min",
          "problem": [
            "`logRequest()` serializes the full cookie header, so every session ID lands in the log pipeline.",
            "Anyone with log access can hijack live sessions."
          ],
          "files": ["apps/api/src/middleware/log.ts:41", "apps/api/src/lib/redact.ts"],
          "plan": [
            "Add `cookie` and `authorization` to `REDACTED_HEADERS` in `redact.ts`.",
            "Route `logRequest()` through `redactHeaders()` before serializing.",
            "Add a test asserting no `sid=` appears in captured log output."
          ],
          "acceptance": "`npm test -- log` passes and `grep -r 'sid=' logs/` on a dev run returns nothing."
        }
      ]
    }
  ],
  "executionOrder": [
    {
      "commit": "1 · log redaction",
      "findings": ["F-01"],
      "rationale": "Single surface: the logging middleware.",
      "verification": "`npm test -- log`"
    }
  ]
}
```

## Fields

- `output` is a `.html` path relative to the repository. `finalize` overwrites an existing file there only if it is a report with the same `report.id`.
- `report.id` is a kebab-case ID. Keep it the same when you update the report.
- `report.title` and `report.topic` form the headline. The renderer shows `topic` in italics after `title`.
- `report.reference` and `report.branch` are optional. Leave out values you do not know instead of inventing them.
- `report.labels` optionally overrides interface labels, with the same keys as `locales/en.json`. A language without a locale file needs every key.
- `finding.effort` takes values such as `~15 min`, `~1 h` or `~1.5 h`. A decimal comma (`1,5 h`) also works. The renderer adds these up for the total in the masthead and the execution order.
- `finding.files` may be empty only when no file applies, for example an infrastructure setting.
- `finding.decision` is `{ "summary": "options…", "recommendation": "…" }`. Add it only when the fix needs a product decision.
- `finding.resolution` goes in only after the fix has landed and you verified it. A finding with a `resolution` shows as Done.

## Computed, never authored

The renderer computes these, so do not write them in the input: the finding and blocker counts, the tally cells (one per severity present), the table of contents, phase numbers, total effort, the status column of the execution order and the colophon state.
