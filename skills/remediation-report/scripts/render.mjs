#!/usr/bin/env node
// remediation-report CLI. Every command prints a JSON receipt; exit code 1
// means a gate failed and its diagnostics say what to repair.
//
//   finalize <input.json> [--consume] [--no-browser]
//                              validate → render → verify → browser → publish
//   validate <input.json>      schema + cross-field rules only
//   extract <report.html> [--to <input.json>]
//                              recover the input of a published report to update it
//   verify <report.html>       static checks of a published report
//   browser-check <report.html>

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { diag, warn, hasErrors, DiagnosticError, runGates, receipt, printReceipt } from './lib/diagnostics.mjs';
import { compile } from './lib/schema.mjs';
import { loadLabels, format } from './lib/i18n.mjs';
import { esc, inline, safeJson, extractPayload, checkSelfContained, readJsonInput, relativePath } from './lib/html.mjs';
import { withBrowser, checkLayout, pageErrors } from './lib/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.join(HERE, '..');
const TEMPLATE_PATH = path.join(SKILL_DIR, 'templates', 'report.html');
const LOCALES_DIR = path.join(SKILL_DIR, 'locales');
const PAYLOAD_ID = 'report-data';
const SEVERITIES = ['critical', 'medium', 'minor'];
const SEVERITY_LABEL = { critical: 'sevCritical', medium: 'sevMedium', minor: 'sevMinor' };
const TALLY_CLASS = { critical: 'c', medium: 'm', minor: 'l' };
const validateSchema = compile(JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'schemas', 'report.schema.json'), 'utf8')));

const pad = n => String(n).padStart(2, '0');
const anchor = id => id.toLowerCase();
const findingsOf = input => input.phases.flatMap(phase => phase.findings);

function effortMinutes(effort) {
  const [, value, unit] = effort.match(/(\d+(?:[.,]\d+)?)\s?(min|h)$/);
  const number = Number(value.replace(',', '.'));
  return unit === 'h' ? number * 60 : number;
}
function formatEffort(minutes, lang) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(hours)} h`;
}

// ---------------------------------------------------------------- validation

function* strings(value, at = '') {
  if (typeof value === 'string') yield [at, value];
  else if (Array.isArray(value)) for (const [i, item] of value.entries()) yield* strings(item, `${at}/${i}`);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) yield* strings(item, `${at}/${key}`);
}

function semanticChecks(input) {
  const out = [];
  const findings = findingsOf(input);
  const ids = findings.map(f => f.id);
  ids.filter((id, i) => ids.indexOf(id) !== i).forEach(id => out.push(diag('report/duplicate-id', `finding ID ${id} is repeated`, { path: '/phases' })));

  const scheduled = new Map();
  input.executionOrder.forEach((row, i) => row.findings.forEach((id, j) => {
    if (!ids.includes(id)) out.push(diag('report/unknown-finding', `${id} is not a finding in any phase`, { path: `/executionOrder/${i}/findings/${j}` }));
    scheduled.set(id, [...(scheduled.get(id) || []), i]);
  }));
  for (const id of ids) {
    const rows = scheduled.get(id) || [];
    if (!rows.length) out.push(diag('report/unscheduled-finding', `${id} appears in no executionOrder commit`, { path: '/executionOrder', fix: `Add ${id} to the commit that touches the same surface.` }));
    if (rows.length > 1) out.push(warn('report/scheduled-twice', `${id} appears in commits ${rows.map(r => r + 1).join(' and ')}`, { path: '/executionOrder' }));
  }

  input.phases.forEach((phase, p) => phase.findings.forEach((finding, f) => {
    if (finding.plan.length < 2 || finding.plan.length > 5) {
      out.push(warn('report/plan-length', `${finding.id} has ${finding.plan.length} plan step(s); aim for 2-5 concrete steps`, { path: `/phases/${p}/findings/${f}/plan` }));
    }
  }));

  for (const [at, text] of strings(input)) {
    if ((text.match(/`/g) || []).length % 2) out.push(warn('report/unbalanced-code', 'odd number of backticks; inline code will not render as intended', { path: at }));
    if (/<\/?[a-z][^>]*>/i.test(text.replace(/`[^`]*`/g, ''))) out.push(warn('report/html-in-text', 'text looks like HTML; it is escaped and shown literally (use `code` or **bold**)', { path: at }));
  }

  const target = path.resolve(input.output);
  if (fs.existsSync(target)) {
    try {
      const existing = extractPayload(fs.readFileSync(target, 'utf8'), PAYLOAD_ID, input.output);
      if (existing.report?.id !== input.report.id) {
        out.push(diag('report/id-mismatch', `${input.output} holds report "${existing.report?.id}"; refusing to overwrite it with "${input.report.id}"`, {
          path: '/output', fix: 'Choose another output path, or keep the existing report.id when updating that report.',
        }));
      }
    } catch {
      out.push(diag('report/foreign-file', `${input.output} exists and is not a generated remediation report`, { path: '/output', fix: 'Choose another output path.' }));
    }
  }
  return out;
}

function prepare(inputPath) {
  const input = readJsonInput(inputPath);
  const diagnostics = validateSchema(input);
  if (hasErrors(diagnostics)) return { diagnostics };
  input.output = relativePath(input.output, 'output');
  const { labels, diagnostics: i18n } = loadLabels(LOCALES_DIR, input.report.language, input.report.labels, '/report');
  diagnostics.push(...i18n, ...semanticChecks(input));
  return { input, labels, diagnostics };
}

// ---------------------------------------------------------------- rendering

const sevBadge = (severity, ui) => `<span class="sev ${severity}">${esc(ui[SEVERITY_LABEL[severity]])}</span>`;
const doneBadge = (ui, label = ui.done) => `<span class="sev done">${esc(label)}</span>`;

function masthead(input, ui, totals) {
  const r = input.report;
  const meta = [[ui.date, esc(r.date)]];
  if (r.branch) meta.push([ui.branch, `<code>${esc(r.branch)}</code>`]);
  meta.push([ui.scope, inline(r.scope)]);
  meta.push([ui.findings, esc(format(ui.findingsCount, { count: totals.count, blockers: totals.bySeverity.critical }))]);
  meta.push([ui.totalEffort, esc(format(ui.totalEffortValue, { value: totals.effort }))]);
  return `<header class="masthead">
	<span class="stamp${r.stamp.tone === 'info' ? ' info' : ''}">${esc(r.stamp.text)}</span>
	<p class="kicker">${[r.project, r.type, r.reference].filter(Boolean).map(esc).join(' · ')}</p>
	<h1>${esc(r.title)} <em>${esc(r.topic)}</em></h1>
	<dl class="masthead-meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
</header>`;
}

function summary(input, ui, totals) {
  const cells = SEVERITIES.filter(s => totals.bySeverity[s] > 0)
    .map(s => `<div class="cell ${TALLY_CLASS[s]}"><div class="num">${totals.bySeverity[s]}</div><div class="lbl">${esc(ui[SEVERITY_LABEL[s]])}</div></div>`);
  return `<section class="summary">
	<p class="lede">${inline(input.report.verdict)}</p>
	<div class="tally" style="grid-template-columns: repeat(${cells.length}, 1fr)">${cells.join('')}</div>
</section>`;
}

function toc(input, ui) {
  return `<nav class="toc" aria-label="${esc(ui.findingsIndex)}"><ol>${findingsOf(input).map(f =>
    `<li><a href="#${anchor(f.id)}"><span class="n">${esc(f.id)}</span> ${inline(f.title)} ${f.resolution ? doneBadge(ui) : sevBadge(f.severity, ui)}</a></li>`).join('')}</ol></nav>`;
}

function finding(f, ui) {
  const decision = f.decision
    ? `<div class="decision"><b>${esc(ui.decisionRequired)}</b><p>${inline(f.decision.summary)}</p><p><strong>${esc(ui.recommendation)}:</strong> ${inline(f.decision.recommendation)}</p></div>`
    : '';
  const files = f.files.length
    ? `<h4 style="margin-top:18px">${esc(ui.files)}</h4><p class="files">${f.files.map(file => `<code>${esc(file)}</code>`).join('<br>')}</p>`
    : '';
  const resolution = f.resolution
    ? `<div class="f-foot resolution"><span class="tag">${esc(ui.resolution)}</span><span class="crit">${inline(f.resolution)}</span></div>`
    : '';
  return `<article class="finding" id="${anchor(f.id)}">
	<div class="f-head"><span class="f-id">${esc(f.id)}</span><h3>${inline(f.title)}</h3>${sevBadge(f.severity, ui)}${f.resolution ? ` ${doneBadge(ui)}` : ''}<span class="effort">${esc(ui.effort)} <b>${esc(f.effort)}</b></span></div>
	<div class="f-body">
		<div class="col"><h4>${esc(ui.problem)}</h4>${f.problem.map(p => `<p>${inline(p)}</p>`).join('')}${decision}${files}</div>
		<div class="col"><h4>${esc(f.decision ? ui.planRecommended : ui.plan)}</h4><ol class="steps">${f.plan.map(step => `<li>${inline(step)}</li>`).join('')}</ol></div>
	</div>
	<div class="f-foot"><span class="tag">${esc(ui.acceptance)}</span><span class="crit">${inline(f.acceptance)}</span></div>
	${resolution}
</article>`;
}

function phases(input, ui) {
  return input.phases.map((phase, i) => `<section class="phase" id="phase-${i + 1}">
	<div class="phase-head"><span class="ph-num">${pad(i + 1)}</span><h2>${inline(phase.title)}</h2><span class="ph-when">${esc(phase.when)}</span></div>
	<p class="phase-intro">${inline(phase.intro)}</p>
	${phase.findings.map(f => finding(f, ui)).join('\n')}
</section>`).join('\n');
}

function executionOrder(input, ui, totals) {
  const resolved = new Set(findingsOf(input).filter(f => f.resolution).map(f => f.id));
  const showStatus = resolved.size > 0;
  const status = row => {
    const done = row.findings.filter(id => resolved.has(id)).length;
    if (done === row.findings.length) return doneBadge(ui, ui.applied);
    return `<span class="sev ${done ? 'medium' : 'minor'}">${esc(done ? ui.partial : ui.pending)}</span>`;
  };
  const head = [ui.commit, ui.findingsColumn, ui.rationale, ui.verification, ...(showStatus ? [ui.status] : [])];
  return `<section class="phase" id="execution-order">
	<div class="phase-head"><span class="ph-num">${pad(input.phases.length + 1)}</span><h2>${esc(ui.executionOrder)}</h2><span class="ph-when">${esc(format(ui.totalEffortValue, { value: totals.effort }))}</span></div>
	<div class="table-wrap"><table class="order-table">
		<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
		<tbody>${input.executionOrder.map(row => `<tr><td class="mono">${esc(row.commit)}</td><td class="mono">${row.findings.map(id => `<a href="#${anchor(id)}">${esc(id)}</a>`).join(', ')}</td><td>${inline(row.rationale)}</td><td class="mono">${inline(row.verification)}</td>${showStatus ? `<td>${status(row)}</td>` : ''}</tr>`).join('')}</tbody>
	</table></div>
</section>`;
}

function colophon(input, ui, totals) {
  const state = totals.resolved === 0 ? ui.colophonReview
    : totals.resolved === totals.count ? ui.colophonDone
      : format(ui.colophonPartial, { resolved: totals.resolved, total: totals.count });
  return `<footer class="colophon"><span>${esc(input.report.project)} · remediation-report</span><span>${esc(state)}</span></footer>`;
}

function build({ input, labels: ui }) {
  const all = findingsOf(input);
  const bySeverity = Object.fromEntries(SEVERITIES.map(s => [s, all.filter(f => f.severity === s).length]));
  const totals = {
    count: all.length, bySeverity,
    resolved: all.filter(f => f.resolution).length,
    effort: formatEffort(all.reduce((sum, f) => sum + effortMinutes(f.effort), 0), input.report.language),
  };
  const body = [masthead(input, ui, totals), summary(input, ui, totals), toc(input, ui), phases(input, ui), executionOrder(input, ui, totals), colophon(input, ui, totals)].join('\n');
  const html = fs.readFileSync(TEMPLATE_PATH, 'utf8')
    .replaceAll('@@LANG@@', esc(input.report.language))
    .replaceAll('@@TITLE@@', esc(`${input.report.title} ${input.report.topic} · ${input.report.project}`))
    .replaceAll('@@DESCRIPTION@@', esc(input.report.verdict.replace(/[`*]/g, '')))
    .replace('@@BODY@@', () => body)
    .replace('@@DATA_JSON@@', () => safeJson(input));
  return { html, totals };
}

// ---------------------------------------------------------------- checks

function verifyFile(file, label = file) {
  if (!fs.existsSync(file)) return [diag('verify/missing', `${label} does not exist`, { path: label })];
  const html = fs.readFileSync(file, 'utf8');
  const out = checkSelfContained(html, label, /@@(?:LANG|TITLE|DESCRIPTION|BODY|DATA_JSON)@@/);
  const input = extractPayload(html, PAYLOAD_ID, label);
  const schemaErrors = validateSchema(input).filter(d => d.severity === 'error');
  if (schemaErrors.length) out.push(diag('verify/payload-schema', `embedded input no longer matches the schema (${schemaErrors[0].path}: ${schemaErrors[0].message})`, { path: label }));
  for (const f of findingsOf(input)) {
    if (!html.includes(`id="${anchor(f.id)}"`)) out.push(diag('verify/finding-missing', `${f.id} has no rendered card`, { path: label }));
  }
  return out;
}

function brokenAnchors() {
  return [...document.querySelectorAll('a[href^="#"]')]
    .map(a => a.getAttribute('href').slice(1))
    .filter(id => !document.getElementById(id));
}

async function browserCheck(file, label) {
  return withBrowser(async open => {
    const page = await open(file);
    const out = await checkLayout(page, label);
    (await page.evaluate(`(${brokenAnchors})()`)).forEach(id => out.push(diag('browser/broken-anchor', `link to #${id} has no target`, { path: label })));
    await page.media('print');
    for (const d of await checkLayout(page, label, [794])) out.push({ ...d, code: 'browser/print-overflow', message: `print: ${d.message}` });
    await page.media('');
    out.push(...pageErrors(page, label));
    return out;
  });
}

// ---------------------------------------------------------------- commands

const rel = file => path.relative(process.cwd(), file).replace(/\\/g, '/');

async function finalize(inputPath, { consume, browser }) {
  let prepared, built, stageFile;
  const outputs = {};
  const result = await runGates([
    { name: 'validate', run: () => { prepared = prepare(inputPath); return { diagnostics: prepared.diagnostics }; } },
    { name: 'render', run: () => {
      built = build(prepared);
      stageFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remediation-report-')), path.basename(prepared.input.output));
      fs.writeFileSync(stageFile, built.html, 'utf8');
    } },
    { name: 'verify', run: () => ({ diagnostics: verifyFile(stageFile, prepared.input.output) }) },
    { name: 'browser', run: () => (browser ? browserCheck(stageFile, prepared.input.output) : { status: 'skipped', diagnostics: [warn('browser/disabled', '--no-browser was passed; the page was not opened')] }) },
    { name: 'publish', run: () => {
      const target = path.resolve(prepared.input.output);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, built.html, 'utf8');
      if (consume) fs.rmSync(path.resolve(inputPath));
      Object.assign(outputs, { report: rel(target), findings: built.totals.count, resolved: built.totals.resolved, effort: built.totals.effort });
    } },
  ]);
  if (stageFile) fs.rmSync(path.dirname(stageFile), { recursive: true, force: true, maxRetries: 5 });
  return receipt('remediation-report', 'finalize', result, outputs);
}

function extract(file, to) {
  const outputs = {};
  const gates = [{ name: 'extract', run: () => {
    if (!fs.existsSync(file)) throw new DiagnosticError(diag('extract/missing', `${file} does not exist`, { path: file }));
    const input = extractPayload(fs.readFileSync(file, 'utf8'), PAYLOAD_ID, file);
    const dest = path.resolve(to || path.join(os.tmpdir(), `remediation-${input.report.id}.json`));
    fs.writeFileSync(dest, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
    outputs.input = dest;
  } }];
  return runGates(gates).then(result => receipt('remediation-report', 'extract', result, outputs));
}

async function main(args) {
  const [command, target] = args;
  const flags = args.slice(2);
  const option = name => { const i = flags.indexOf(name); return i === -1 ? undefined : flags[i + 1]; };
  if (command === 'finalize' && target) return finalize(target, { consume: flags.includes('--consume'), browser: !flags.includes('--no-browser') });
  if (command === 'validate' && target) {
    return receipt('remediation-report', 'validate', await runGates([{ name: 'validate', run: () => ({ diagnostics: prepare(target).diagnostics }) }]));
  }
  if (command === 'extract' && target) return extract(target, option('--to'));
  if (command === 'verify' && target) {
    return receipt('remediation-report', 'verify', await runGates([{ name: 'verify', run: () => ({ diagnostics: verifyFile(path.resolve(target), target) }) }]));
  }
  if (command === 'browser-check' && target) {
    return receipt('remediation-report', 'browser-check', await runGates([{ name: 'browser', run: () => browserCheck(path.resolve(target), target) }]));
  }
  process.stderr.write('Usage:\n  node render.mjs finalize <input.json> [--consume] [--no-browser]\n  node render.mjs validate <input.json>\n  node render.mjs extract <report.html> [--to <input.json>]\n  node render.mjs verify <report.html>\n  node render.mjs browser-check <report.html>\n');
  process.exitCode = 2;
  return null;
}

const result = await main(process.argv.slice(2));
if (result) printReceipt(result);
