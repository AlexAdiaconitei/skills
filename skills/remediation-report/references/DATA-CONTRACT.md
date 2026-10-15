# Report input contract

Read this file while preparing renderer input. [`schemas/report.schema.json`](../schemas/report.schema.json) is the exact contract and `finalize` enforces it; this file shows the shape and what each part means.

Text is plain text. The only inline markup is `` `code` `` and `**bold**`; anything that looks like HTML is escaped and shown literally.

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

- `output`: repository-relative `.html` path. An existing file at that path is overwritten only when it is a report with the same `report.id`.
- `report.id`: stable kebab-case ID. Keep it when updating the report.
- `report.title` + `report.topic`: the headline. `topic` is rendered emphasized after `title`.
- `report.reference`, `report.branch`: optional; omit unknown values rather than inventing them.
- `report.labels`: optional overrides of interface labels, keyed like `locales/en.json`. Required in full for a language without a locale file.
- `finding.effort`: `~15 min`, `~1 h`, `~1.5 h` (or `1,5 h`). The total in the masthead and execution order is computed from these.
- `finding.files`: may be empty only when no file applies, e.g. an infrastructure setting.
- `finding.decision`: `{ "summary": "options…", "recommendation": "…" }`, only when a product decision is required.
- `finding.resolution`: only after the fix landed and was verified. Its presence marks the finding Done.

## Computed, never authored

Finding count and blockers, tally cells (only severities present), table of contents, phase numbers, total effort, the execution-order status column and the colophon state.
