// GENERATED from shared/i18n.mjs by scripts/sync-shared.mjs. Edit the source, not this copy.
// Interface labels live in <skill>/locales/<lang>.json, one file per language,
// with en.json as the reference key set. An input may carry `labels` to
// translate into a language without a locale file, or to override a label.

import fs from 'node:fs';
import path from 'node:path';
import { warn } from './diagnostics.mjs';

export function availableLocales(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
}

export function readLocale(dir, lang) {
  return JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'));
}

// Returns { lang, labels, diagnostics }. `basePath` is the JSON pointer of the
// object holding `language`/`labels`, used to point diagnostics at the input.
export function loadLabels(dir, lang, overrides = {}, basePath = '') {
  const reference = readLocale(dir, 'en');
  const locales = availableLocales(dir);
  const diagnostics = [];
  const primary = lang.toLowerCase().split('-')[0];
  const chosen = locales.includes(lang) ? lang : (locales.includes(primary) ? primary : null);
  const labels = { ...reference, ...(chosen ? readLocale(dir, chosen) : {}) };

  for (const key of Object.keys(overrides)) {
    if (!(key in reference)) diagnostics.push(warn('i18n/unknown-label', `label "${key}" does not exist and is ignored`, { path: `${basePath}/labels/${key}` }));
    else labels[key] = overrides[key];
  }
  if (!chosen) {
    const missing = Object.keys(reference).filter(key => !(key in overrides));
    if (missing.length) {
      diagnostics.push(warn('i18n/fallback', `no locale for "${lang}"; ${missing.length} interface label(s) fall back to English`, {
        path: `${basePath}/language`,
        fix: `Translate ${missing.length === Object.keys(reference).length ? 'every key of locales/en.json' : `these keys: ${missing.join(', ')}`} into ${basePath}/labels, or use one of: ${locales.join(', ')}`,
      }));
    }
  }
  return { lang, labels, diagnostics };
}

// "{count} findings" + { count: 3 } -> "3 findings"
export function format(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}
