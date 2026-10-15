// GENERATED from shared/html.mjs by scripts/sync-shared.mjs. Edit the source, not this copy.
// HTML helpers shared by the renderers. All authored text is plain text and is
// escaped; `inline` additionally turns `code` and **strong** into markup.

import fs from 'node:fs';
import path from 'node:path';
import { diag, DiagnosticError } from './diagnostics.mjs';

export function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function inline(value) {
  return esc(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function extractPayload(html, id, file) {
  const match = html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`));
  if (!match) throw new DiagnosticError(diag('output/payload-missing', `${file} has no ${id} payload`, { path: file }));
  try { return JSON.parse(match[1]); } catch (error) {
    throw new DiagnosticError(diag('output/payload-invalid', `${file} has an unreadable ${id} payload: ${error.message}`, { path: file }));
  }
}

// Static checks every generated page must pass: no leftover template slots,
// no remote scripts/media/CSS except Google Fonts stylesheets.
export function checkSelfContained(html, file, slotPattern) {
  const out = [];
  const slots = html.match(slotPattern);
  if (slots) out.push(diag('output/unreplaced-slot', `unreplaced template slot ${slots[0]}`, { path: file }));
  if (/<(?:script|img|iframe|video|audio)\b[^>]*\ssrc=['"]https?:/i.test(html)) out.push(diag('output/remote-source', 'remote script or media source', { path: file }));
  for (const [, url] of html.matchAll(/<link\b[^>]*href=['"](https?:[^'"]+)['"]/gi)) {
    if (!/^https:\/\/fonts\.(?:googleapis|gstatic)\.com/.test(url)) out.push(diag('output/remote-link', `unexpected remote link ${url}`, { path: file }));
  }
  if (/@import|url\s*\(\s*['"]?https?:/i.test(html)) out.push(diag('output/remote-css', 'remote CSS dependency', { path: file }));
  return out;
}

export function readJsonInput(file) {
  let text;
  try { text = fs.readFileSync(path.resolve(file), 'utf8'); } catch (error) {
    throw new DiagnosticError(diag('input/unreadable', `cannot read ${file}: ${error.code || error.message}`));
  }
  try { return JSON.parse(text); } catch (error) {
    throw new DiagnosticError(diag('input/json', `${file} is not valid JSON: ${error.message}`, { fix: 'Fix the JSON syntax; no field was validated yet.' }));
  }
}

// Repository-relative path that cannot escape the working directory.
export function relativePath(value, label) {
  const normalized = String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (path.isAbsolute(value) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new DiagnosticError(diag('input/path', `${label} must be repository-relative and cannot traverse upward`, { path: `/${label}` }));
  }
  return normalized;
}
