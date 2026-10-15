#!/usr/bin/env node
// planning-dossier CLI. Every command prints a JSON receipt; exit code 1 means
// a gate failed and its diagnostics say what to repair.
//
//   finalize <input.json> [--consume] [--no-browser]
//                                validate → render → verify → browser → publish
//   validate <input.json>        schema + cross-field rules only
//   verify <dossier-dir>         static checks of a published dossier
//   browser-check <dossier-dir>  headless browser checks of index + latest round

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { diag, warn, hasErrors, DiagnosticError, runGates, receipt, printReceipt } from './lib/diagnostics.mjs';
import { compile } from './lib/schema.mjs';
import { loadLabels } from './lib/i18n.mjs';
import { esc, safeJson, extractPayload, checkSelfContained, readJsonInput, relativePath } from './lib/html.mjs';
import { withBrowser, checkLayout, pageErrors } from './lib/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.join(HERE, '..');
const TEMPLATE_PATH = path.join(SKILL_DIR, 'templates', 'dossier.html');
const LOCALES_DIR = path.join(SKILL_DIR, 'locales');
const SCHEMA_VERSION = 1;
const validateSchema = compile(JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'schemas', 'round.schema.json'), 'utf8')));

function pad(number) { return String(number).padStart(2, '0'); }
function countOpen(items) { return items.filter(item => item.status === 'open' || item.status === 'blocked').length; }
function criticalityCounts(round) {
  const counts = { blocker:0, material:0, watch:0 };
  round.decisions.forEach(item => { counts[item.criticality] += 1; });
  round.threads.filter(item => item.status === 'open' || item.status === 'blocked').forEach(item => { counts[item.criticality] += 1; });
  return counts;
}
function duplicates(values) { return values.filter((value, index) => values.indexOf(value) !== index); }

// ---------------------------------------------------------------- validation

function readManifest(indexPath) {
  if (!fs.existsSync(indexPath)) return null;
  const data = extractPayload(fs.readFileSync(indexPath, 'utf8'), 'planning-data', indexPath);
  if (!data.manifest) throw new DiagnosticError(diag('dossier/manifest-missing', `${indexPath} has no manifest`, { path: indexPath }));
  return data.manifest;
}

function semanticChecks(input, manifest) {
  const out = [];
  const { round, currentState } = input;

  round.decisions.forEach((decision, i) => {
    const ids = decision.options.map(option => option.id);
    duplicates(ids).forEach(id => out.push(diag('dossier/duplicate-option', `option ID "${id}" is repeated`, { path: `/round/decisions/${i}/options` })));
    if (!ids.includes(decision.recommendation)) {
      out.push(diag('dossier/unknown-recommendation', `recommendation "${decision.recommendation}" is not an option ID`, { path: `/round/decisions/${i}/recommendation`, fix: `Use one of: ${ids.join(', ')}` }));
    }
  });
  duplicates([...round.decisions, ...round.threads].map(item => item.id))
    .forEach(id => out.push(diag('dossier/duplicate-id', `round decision/thread ID "${id}" is repeated`, { path: '/round' })));
  duplicates([...currentState.decisions, ...currentState.threads].map(item => item.id))
    .forEach(id => out.push(diag('dossier/duplicate-id', `currentState ID "${id}" is repeated`, { path: '/currentState' })));

  const known = new Set([...round.decisions, ...round.threads, ...currentState.decisions, ...currentState.threads].map(item => item.id));
  round.threads.forEach((thread, i) => (thread.blockedBy || []).forEach((ref, j) => {
    if (!known.has(ref)) out.push(warn('dossier/unknown-dependency', `blockedBy "${ref}" is not a known decision or thread ID`, { path: `/round/threads/${i}/blockedBy/${j}` }));
  }));
  const ledgerIds = new Set([...currentState.decisions, ...currentState.threads].map(item => item.id));
  [...round.decisions, ...round.threads].forEach(item => {
    if (!ledgerIds.has(item.id)) out.push(diag('dossier/ledger-missing', `${item.id} appears in the round but not in currentState`, { path: '/currentState', fix: `Add ${item.id} to currentState.${item.id.startsWith('T') ? 'threads' : 'decisions'} with its current status.` }));
  });

  if (!round.evidence.length && !round.decisions.length && !round.threads.length && !round.sections.length) {
    out.push(diag('dossier/empty-round', 'round has no evidence, decisions, threads or sections', { path: '/round' }));
  }
  if (round.kind === 'final') {
    const unresolved = [...currentState.decisions, ...currentState.threads].filter(item => item.status === 'open' || item.status === 'blocked');
    if (unresolved.length) {
      out.push(diag('dossier/final-unresolved', `final round has unresolved ledger items: ${unresolved.map(item => item.id).join(', ')}`, {
        path: '/currentState', fix: 'Run another planning round, or decide/defer/discard these items with an outcome.',
      }));
    }
  }

  if (manifest) {
    const previous = manifest.rounds.at(-1);
    if (manifest.schemaVersion !== SCHEMA_VERSION) out.push(diag('dossier/schema-version', 'existing dossier uses an unsupported schema version', { path: input.outputDir }));
    if (manifest.dossier.id !== input.dossier.id) out.push(diag('dossier/id-mismatch', `dossier.id must stay "${manifest.dossier.id}"`, { path: '/dossier/id' }));
    if (manifest.outputDir !== input.outputDir) out.push(diag('dossier/output-mismatch', `outputDir must stay "${manifest.outputDir}"`, { path: '/outputDir' }));
    if (round.number !== previous.number + 1) out.push(diag('dossier/round-sequence', `round.number must be ${previous.number + 1}`, { path: '/round/number' }));
    for (const key of ['decisions', 'threads']) {
      const nextIds = new Set(currentState[key].map(item => item.id));
      const missing = manifest.current[key].filter(item => !nextIds.has(item.id)).map(item => item.id);
      if (missing.length) {
        out.push(diag('dossier/ledger-removed', `currentState.${key} silently removes prior IDs: ${missing.join(', ')}`, {
          path: `/currentState/${key}`, fix: 'Carry every prior item forward; change its status (discarded, deferred…) instead of deleting it.',
        }));
      }
    }
  } else if (round.number !== 1) {
    out.push(diag('dossier/round-sequence', 'a new dossier must start at round 1', { path: '/round/number', fix: `No index.html exists in ${input.outputDir}; check outputDir if this continues a dossier.` }));
  }

  const roundFile = `round-${pad(round.number)}-${round.slug}.html`;
  if (fs.existsSync(path.resolve(input.outputDir, roundFile))) {
    out.push(diag('dossier/round-exists', `${roundFile} already exists; rounds are immutable`, { path: '/round/number', fix: 'Publish the change as the next round instead.' }));
  }
  return out;
}

function prepare(inputPath) {
  const input = readJsonInput(inputPath);
  const diagnostics = validateSchema(input);
  if (hasErrors(diagnostics)) return { diagnostics };
  input.outputDir = relativePath(input.outputDir, 'outputDir');
  const { labels, diagnostics: i18n } = loadLabels(LOCALES_DIR, input.dossier.language, input.dossier.labels, '/dossier');
  diagnostics.push(...i18n);
  const manifest = readManifest(path.join(path.resolve(input.outputDir), 'index.html'));
  diagnostics.push(...semanticChecks(input, manifest));
  return { input, labels, manifest, diagnostics };
}

// ---------------------------------------------------------------- rendering

function applyTemplate({ lang, title, description, body, data, ui }) {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8')
    .replaceAll('@@LANG@@', esc(lang))
    .replaceAll('@@TITLE@@', esc(title))
    .replaceAll('@@DESCRIPTION@@', esc(description))
    .replaceAll('@@SKIP_LABEL@@', esc(ui.skip))
    .replace('@@BODY@@', () => body)
    .replace('@@DATA_JSON@@', () => safeJson(data));
}
function badge(criticality, label = criticality) { return `<span class="badge ${esc(criticality)}">${esc(label)}</span>`; }
function nav(output, previous, ui, currentFile) {
  const prev = previous ? `<a href="${esc(previous.file)}">← ${esc(ui.previous)} · ${pad(previous.number)}</a>` : '';
  return `<nav class="topnav" aria-label="${esc(ui.timeline)}"><div class="topnav-group"><a href="index.html">← ${esc(ui.index)}</a>${prev}</div><span>${esc(ui.current)} · ${esc(currentFile)}</span></nav>`;
}
function meta(dossier, round, ui) {
  const values = [[ui.date, round.date], [ui.scope, dossier.scope]];
  if (dossier.branch) values.push([ui.branch, `<code>${esc(dossier.branch)}</code>`]);
  if (dossier.sourceRef) values.push([ui.source, `<code>${esc(dossier.sourceRef)}</code>`]);
  return `<dl class="masthead-meta">${values.map(([key,value]) => `<div><dt>${esc(key)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}
function masthead(dossier, round, ui, isIndex = false) {
  const kind = isIndex ? ui.index : (round.kind === 'final' ? ui.final : `${ui.round} · ${pad(round.number)}`);
  const emphasized = esc(round.title).replace(/\s+([^\s]+)$/, ' <em>$1</em>');
  return `<header class="masthead"><p class="kicker">${esc(dossier.project)} · ${esc(kind)}</p><h1>${emphasized}</h1><span class="stamp">${esc(round.status)} · ${isIndex ? esc(ui.current) : pad(round.number)}</span><p class="lede">${esc(round.summary)}</p>${meta(dossier, round, ui)}</header>`;
}
function tally(counts, ui) {
  return `<div class="tally">${['blocker', 'material', 'watch'].map(key => `<div class="cell ${key}"><div class="num">${counts[key]}</div><div class="lbl">${esc(ui[key])}</div></div>`).join('')}</div>`;
}
function sectionHead(label, title, intro) {
  return `<div class="section-head"><span class="section-label">${esc(label)}</span><h2>${esc(title)}</h2></div>${intro ? `<p class="section-intro">${esc(intro)}</p>` : ''}`;
}
function renderEvidence(round, ui) {
  if (!round.evidence.length) return '';
  return `<section class="section" id="evidence">${sectionHead(ui.evidence, ui.evidenceTitle, ui.evidenceIntro)}<div class="evidence-grid">${round.evidence.map(item => `<article class="evidence-card"><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p>${item.refs.length ? `<ul class="refs">${item.refs.map(ref => `<li><code>${esc(ref)}</code></li>`).join('')}</ul>` : ''}</article>`).join('')}</div></section>`;
}
function optionCard(decision, option, ui) {
  const inputType = decision.mode === 'single' ? 'radio' : 'checkbox';
  const recommended = decision.recommendation === option.id ? `<span class="recommended">${esc(ui.recommendation)}</span>` : '';
  return `<label class="option"><span class="option-top"><input data-state type="${inputType}" name="decision.${esc(decision.id)}.option" value="${esc(option.id)}"><span class="option-title">${esc(option.label)}</span>${recommended}</span><span class="option-summary">${esc(option.summary)}</span><dl class="option-meta"><div><dt>${esc(ui.reversibility)}</dt><dd>${esc(option.reversibility)}</dd></div><div><dt>${esc(ui.complexity)}</dt><dd>${esc(option.complexity)}</dd></div><div><dt>${esc(ui.uncertainty)}</dt><dd>${esc(option.uncertainty)}</dd></div></dl>${option.tradeoffs.length ? `<ul class="tradeoffs">${option.tradeoffs.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${option.surfaces.length ? `<ul class="meta-list" aria-label="${esc(ui.surfaces)}">${option.surfaces.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}</label>`;
}
function dispositionSelect(name, id, ui, thread = false) {
  return `<select data-state id="${esc(id)}" name="${esc(name)}"><option value="">${esc(ui.chooseDisposition)}</option><option value="${thread ? 'resolve' : 'decide'}">${esc(thread ? ui.resolve : ui.decide)}</option><option value="investigate">${esc(ui.investigate)}</option><option value="defer">${esc(ui.defer)}</option><option value="discard">${esc(ui.discard)}</option></select>`;
}
function renderDecision(decision, ui) {
  return `<article class="decision-card" data-criticality="${esc(decision.criticality)}"><div class="card-head"><span class="folio" aria-hidden="true">${esc(decision.id.replace(/\D/g,''))}</span><h3>${esc(decision.title)}</h3><div class="card-head-right">${badge(decision.criticality, ui[decision.criticality])}</div></div><div class="card-copy"><p class="question">${esc(decision.question)}</p><p class="rationale">${esc(decision.rationale)}</p></div><div class="option-grid">${decision.options.map(option => optionCard(decision, option, ui)).join('')}</div><div class="response"><div class="field"><label for="disp-${esc(decision.id)}">${esc(ui.disposition)}</label>${dispositionSelect(`decision.${decision.id}.disposition`, `disp-${decision.id}`, ui)}</div><div class="field"><label for="note-${esc(decision.id)}">${esc(decision.notesPrompt || ui.notes)}</label><textarea data-state id="note-${esc(decision.id)}" name="decision.${esc(decision.id)}.note"></textarea></div></div></article>`;
}
function renderDecisions(round, ui) {
  if (!round.decisions.length) return '';
  return `<section class="section" id="decision-frontier">${sectionHead(ui.frontier, ui.frontierTitle, ui.frontierIntro)}<div class="decision-list">${round.decisions.map(item => renderDecision(item, ui)).join('')}</div></section>`;
}
function renderThread(thread, ui) {
  const blocked = thread.status === 'blocked';
  const stateBadge = thread.status === 'resolved' || thread.status === 'discarded' ? badge('done', thread.status) : badge(thread.criticality, ui[thread.criticality]);
  const extra = thread.reactivation ? `<p class="blocked-by">${esc(ui.reactivation)} · ${esc(thread.reactivation)}</p>` : '';
  const resolution = thread.resolution ? `<p class="blocked-by">${esc(thread.resolution)}</p>` : '';
  const controls = thread.status === 'open' ? `<div class="response interactive-only"><div class="field"><label for="thread-disp-${esc(thread.id)}">${esc(ui.disposition)}</label>${dispositionSelect(`thread.${thread.id}.disposition`, `thread-disp-${thread.id}`, ui, true)}</div><div class="field"><label for="thread-note-${esc(thread.id)}">${esc(ui.notes)}</label><textarea data-state id="thread-note-${esc(thread.id)}" name="thread.${esc(thread.id)}.note"></textarea></div></div>` : '';
  return `<article class="thread-card ${blocked ? 'blocked' : ''}"><div class="card-head"><span class="folio" aria-hidden="true">${esc(thread.id.replace(/\D/g,''))}</span><h3>${esc(thread.title)}</h3><div class="card-head-right">${stateBadge}</div></div><div class="thread-body"><p>${esc(thread.detail)}</p>${blocked ? `<p class="blocked-by">${esc(ui.blockedBy)} · ${esc((thread.blockedBy || []).join(', '))}</p>` : ''}${extra}${resolution}</div>${controls}</article>`;
}
function renderThreads(round, ui) {
  if (!round.threads.length) return '';
  return `<section class="section" id="loose-threads">${sectionHead(ui.threads, ui.threadsTitle, ui.threadsIntro)}<div class="thread-list">${round.threads.map(item => renderThread(item, ui)).join('')}</div></section>`;
}
function renderBlock(block) {
  if (block.type === 'prose') return `<div class="prose">${block.paragraphs.map(item => `<p>${esc(item)}</p>`).join('')}</div>`;
  if (block.type === 'list') return `<div class="list-block"><h3>${esc(block.title)}</h3><ul class="outcomes">${block.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>`;
  if (block.type === 'steps') return `<div class="steps-block"><ol class="steps">${block.items.map(item => `<li>${esc(item)}</li>`).join('')}</ol></div>`;
  if (block.type === 'table') return `<div class="table-wrap"><table class="order-table"><thead><tr>${block.columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${block.columns.map(column => `<td>${esc(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (block.type === 'cards') return `<div class="cards-grid">${block.items.map(item => `<article class="mini-card">${item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ''}<h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${item.meta?.length ? `<ul class="meta-list">${item.meta.map(meta => `<li>${esc(meta)}</li>`).join('')}</ul>` : ''}</article>`).join('')}</div>`;
  if (block.type === 'code') return `<div class="code-block"><div class="code-label">${esc(block.label)}</div><pre><code>${esc(block.code)}</code></pre></div>`;
  if (block.type === 'flow') return `<div class="flow-block"><div class="flow">${block.nodes.map((node, index) => `${index ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ''}<div class="flow-node"><strong>${esc(node.title)}</strong><span>${esc(node.detail)}</span></div>`).join('')}</div></div>`;
  if (block.type === 'callout') return `<div class="callout ${esc(block.tone)}"><b>${esc(block.title)}</b><p>${esc(block.body)}</p></div>`;
  return '';
}
function renderSections(round) {
  return round.sections.map(section => `<section class="section" id="${esc(section.id)}">${sectionHead(section.label, section.title, section.intro)}<div class="content-stack">${section.blocks.map(renderBlock).join('')}</div></section>`).join('');
}
function intentControls(ui) {
  return `<section class="section interactive-only" id="next-intent">${sectionHead(ui.nextIntent, ui.nextIntent, '')}<div class="intent-grid"><label class="intent"><input data-state type="radio" name="intent" value="continue"><span><b>${esc(ui.continuePlanning)}</b><small>${esc(ui.continueHelp)}</small></span></label><label class="intent"><input data-state type="radio" name="intent" value="investigate"><span><b>${esc(ui.investigateIntent)}</b><small>${esc(ui.investigateHelp)}</small></span></label><label class="intent"><input data-state type="radio" name="intent" value="consolidate"><span><b>${esc(ui.consolidate)}</b><small>${esc(ui.consolidateHelp)}</small></span></label></div><div class="field" style="margin-top:18px"><label for="global-notes">${esc(ui.corrections)}</label><textarea data-state id="global-notes" name="globalNotes" placeholder="${esc(ui.correctionsHelp)}"></textarea></div></section>`;
}
function dispatch(ui, final = false) {
  return `<aside class="dispatch interactive-only" aria-label="${esc(final ? ui.finalHandoff : ui.nextIntent)}"><div class="dispatch-grid"><div class="progress"><div class="progress-label">${esc(ui.progress)} · <span id="progress-text">0/0</span></div><div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div><p class="validation-hint" id="validation-hint"></p></div><button class="btn ghost" id="reset-state" type="button">${esc(ui.reset)}</button><button class="btn primary" id="copy-markdown" type="button" disabled>${esc(final ? ui.copyHandoff : ui.copyMarkdown)}</button></div></aside><p class="sr-only" id="live-status" role="status" aria-live="polite"></p>`;
}
function renderRound(data, previous) {
  const { dossier, round, ui } = data;
  const counts = criticalityCounts(round);
  const finalCallout = round.kind === 'final' ? `<section class="section" id="implementation-handoff">${sectionHead(ui.finalHandoff, round.finalHandoff.title, ui.finalHandoffIntro)}<div class="callout success"><b>${esc(ui.startWith)}</b><p>${esc(round.finalHandoff.startWith)}</p></div></section>` : '';
  const formOpen = `<form id="planning-form" novalidate>`;
  const interactive = round.kind === 'final' ? `${renderThreads(round, ui)}${finalCallout}` : `${renderDecisions(round, ui)}${renderThreads(round, ui)}${intentControls(ui)}`;
  return `<div class="sheet">${nav(data.outputDir, previous, ui, round.file)}<main id="main">${masthead(dossier, round, ui)}<section class="summary"><p class="summary-copy"><strong>${esc(ui.objective)}.</strong> ${esc(dossier.objective)}</p>${tally(counts, ui)}</section>${formOpen}${renderEvidence(round, ui)}${renderSections(round)}${interactive}${dispatch(ui, round.kind === 'final')}</form></main><footer class="colophon"><span>${esc(dossier.project)} · planning-dossier</span><span>${esc(ui.immutable)}</span></footer></div>`;
}
function ledgerRows(current, ui) {
  const rows = [...current.decisions, ...current.threads];
  if (!rows.length) return `<p class="section-intro">${esc(ui.noLedger)}</p>`;
  return `<div class="ledger"><div class="ledger-row"><b>${esc(ui.id)}</b><b>${esc(ui.item)}</b><b>${esc(ui.status)}</b><b>${esc(ui.outcome)}</b></div>${rows.map(item => `<div class="ledger-row"><span class="ledger-id">${esc(item.id)}</span><strong>${esc(item.title)}</strong><span>${esc(item.status)}</span><span>${esc(item.outcome || '—')}</span></div>`).join('')}</div>`;
}
function renderIndex(data) {
  const { dossier, manifest, ui } = data;
  const currentRound = manifest.rounds.at(-1);
  const pseudoRound = { ...currentRound, title:dossier.title, summary:manifest.current.summary, date:currentRound.date, status:manifest.current.status, kind:'index', number:currentRound.number };
  const openThreads = countOpen(manifest.current.threads);
  const openDecisions = countOpen(manifest.current.decisions);
  const statusCounts = { blocker:0, material:openDecisions, watch:openThreads };
  const timeline = `<section class="section" id="timeline">${sectionHead(ui.timeline, ui.timelineTitle, ui.timelineIntro)}<div class="timeline">${manifest.rounds.map((round, index) => `<article class="timeline-entry ${index === manifest.rounds.length - 1 ? 'current' : ''}"><span class="timeline-dot">${pad(round.number)}</span><div class="timeline-body"><h3><a href="${esc(round.file)}">${esc(round.title)}</a></h3><p>${esc(round.summary)}</p><div class="timeline-meta"><span>${esc(round.date)}</span><span>${esc(round.kind)}</span><span>${round.decisionCount} ${esc(ui.decisions)}</span><span>${round.threadCount} ${esc(ui.threads)}</span></div></div></article>`).join('')}</div></section>`;
  const ledger = `<section class="section" id="ledger">${sectionHead(ui.ledger, ui.ledgerTitle, '')}${ledgerRows(manifest.current, ui)}</section>`;
  return `<div class="sheet"><nav class="topnav" aria-label="${esc(ui.timeline)}"><div class="topnav-group"><a href="${esc(currentRound.file)}">${esc(ui.current)} →</a></div><span>${esc(data.outputDir)}/index.html</span></nav><main id="main">${masthead(dossier, pseudoRound, ui, true)}<section class="summary"><p class="summary-copy"><strong>${esc(ui.objective)}.</strong> ${esc(dossier.objective)}</p>${tally(statusCounts, ui)}</section>${timeline}${ledger}</main><footer class="colophon"><span>${esc(dossier.project)} · planning-dossier</span><span>${esc(ui.generated)}</span></footer></div>`;
}

function build({ input, labels: ui, manifest }) {
  const rounds = manifest ? manifest.rounds.slice() : [];
  const previous = rounds.at(-1) || null;
  const roundFile = `round-${pad(input.round.number)}-${input.round.slug}.html`;
  const round = { ...input.round, file:roundFile };
  const roundRecord = {
    number:round.number, file:roundFile, title:round.title, date:round.date, kind:round.kind,
    status:round.status, summary:round.summary, decisionCount:round.decisions.length, threadCount:round.threads.length
  };
  rounds.push(roundRecord);
  const lang = input.dossier.language;
  const nextManifest = { schemaVersion:SCHEMA_VERSION, outputDir:input.outputDir, dossier:input.dossier, rounds, current:input.currentState };
  const roundData = { schemaVersion:SCHEMA_VERSION, outputDir:input.outputDir, dossier:input.dossier, round, currentState:input.currentState, ui };
  const roundHtml = applyTemplate({ lang, ui, title:`${round.title} · ${input.dossier.project}`, description:round.summary, body:renderRound(roundData, previous), data:roundData });
  const indexRound = { ...roundRecord, decisions:[], threads:[], kind:'index' };
  const indexData = { schemaVersion:SCHEMA_VERSION, outputDir:input.outputDir, dossier:input.dossier, round:indexRound, manifest:nextManifest, ui };
  const indexHtml = applyTemplate({ lang, ui, title:`${input.dossier.title} · planning dossier`, description:input.currentState.summary, body:renderIndex(indexData), data:indexData });
  return { roundFile, roundHtml, indexHtml };
}

// Copies the published dossier plus the new files into a temp directory, so
// verification and browser checks run on the exact result before publishing.
function stage(outputDir, built) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-dossier-'));
  if (fs.existsSync(outputDir)) {
    for (const file of fs.readdirSync(outputDir)) if (file.endsWith('.html')) fs.copyFileSync(path.join(outputDir, file), path.join(dir, file));
  }
  fs.writeFileSync(path.join(dir, built.roundFile), built.roundHtml, 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), built.indexHtml, 'utf8');
  return dir;
}

// ---------------------------------------------------------------- checks

function verifyDir(directory) {
  const outputDir = path.resolve(directory);
  const indexPath = path.join(outputDir, 'index.html');
  if (!fs.existsSync(indexPath)) return [diag('verify/index-missing', 'index.html does not exist', { path: directory })];
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const manifest = extractPayload(indexHtml, 'planning-data', 'index.html').manifest;
  if (!manifest?.rounds?.length) return [diag('verify/manifest-empty', 'index manifest has no rounds', { path: 'index.html' })];
  const out = [];
  const files = [{ name:'index.html', html:indexHtml }];
  manifest.rounds.forEach((round, index) => {
    if (round.number !== index + 1) out.push(diag('verify/round-sequence', `round sequence breaks at ${round.file}`, { path: round.file }));
    const roundPath = path.join(outputDir, round.file);
    if (!fs.existsSync(roundPath)) { out.push(diag('verify/round-missing', `missing ${round.file}`, { path: round.file })); return; }
    const html = fs.readFileSync(roundPath, 'utf8');
    try {
      const data = extractPayload(html, 'planning-data', round.file);
      if (data.round.number !== round.number || data.round.file !== round.file) out.push(diag('verify/payload-mismatch', `payload mismatch in ${round.file}`, { path: round.file }));
    } catch (error) { out.push(...(error.diagnostics || [diag('verify/payload', error.message, { path: round.file })])); }
    files.push({ name:round.file, html });
  });
  files.forEach(file => out.push(...checkSelfContained(file.html, file.name, /@@(?:LANG|TITLE|DESCRIPTION|SKIP_LABEL|BODY|DATA_JSON)@@/)));
  return out;
}

// Runs inside the page: answers every item, then checks validation, autosave
// and the Markdown capsule through the template's window.__planningDossier hook.
async function fillRound() {
  const api = window.__planningDossier;
  if (!api) return { problems: ['test hook window.__planningDossier is missing from the template'] };
  const data = JSON.parse(document.getElementById('planning-data').textContent);
  const form = document.getElementById('planning-form');
  const problems = [];
  const fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  for (const el of form.querySelectorAll('[data-state]')) if (!el.labels || !el.labels.length) problems.push(`control ${el.name} has no label`);
  for (const d of data.round.decisions) {
    form.querySelector(`input[name="decision.${d.id}.option"][value="${d.recommendation}"]`).click();
    const select = form.elements[`decision.${d.id}.disposition`];
    select.value = 'decide'; fire(select);
  }
  for (const t of data.round.threads.filter(t => t.status === 'open')) {
    const select = form.elements[`thread.${t.id}.disposition`];
    select.value = 'resolve'; fire(select);
    const note = form.elements[`thread.${t.id}.note`];
    note.value = 'browser-check note'; fire(note);
  }
  const intent = form.querySelector('input[name="intent"][value="continue"]');
  if (intent) intent.click();
  await new Promise(r => setTimeout(r, 300));
  const result = api.validate(false);
  if (!result.valid) problems.push('form stays incomplete after every item has a disposition');
  if (document.getElementById('copy-markdown').disabled) problems.push('copy button stays disabled on a complete form');
  if (form.querySelector('[data-state]')) {
    let saved = null;
    try { saved = localStorage.getItem(api.storageKey); } catch { /* reported below */ }
    if (!saved) problems.push('autosave wrote nothing to localStorage');
  }
  const markdown = api.buildMarkdown(result);
  for (const d of data.round.decisions) {
    if (!markdown.includes(d.id) || !markdown.includes('`' + d.recommendation + '`')) problems.push(`Markdown capsule misses decision ${d.id}`);
  }
  if (data.round.kind === 'final' && !markdown.includes(data.round.finalHandoff.instruction)) problems.push('handoff Markdown misses the final instruction');
  return { problems };
}

async function checkRestoreAndReset() {
  const api = window.__planningDossier;
  const data = JSON.parse(document.getElementById('planning-data').textContent);
  const form = document.getElementById('planning-form');
  const problems = [];
  for (const d of data.round.decisions) {
    if (!form.querySelector(`input[name="decision.${d.id}.option"][value="${d.recommendation}"]`).checked) problems.push(`selection for ${d.id} is not restored after reload`);
    if (form.elements[`decision.${d.id}.disposition`].value !== 'decide') problems.push(`disposition for ${d.id} is not restored after reload`);
  }
  document.getElementById('reset-state').click();
  let left = null;
  try { left = localStorage.getItem(api.storageKey); } catch { /* storage unavailable */ }
  if (left) problems.push('reset leaves the draft in localStorage');
  if (form.querySelector('input[data-state]:checked')) problems.push('reset leaves selections checked');
  return problems;
}

function hiddenWhenPrinting() {
  return [...document.querySelectorAll('.topnav, .dispatch, .interactive-only')]
    .filter(el => getComputedStyle(el).display !== 'none')
    .map(el => el.className);
}

async function browserCheck(dir, roundFile) {
  return withBrowser(async open => {
    const out = [];
    const index = await open(path.join(dir, 'index.html'));
    out.push(...await checkLayout(index, 'index.html'), ...pageErrors(index, 'index.html'));

    const page = await open(path.join(dir, roundFile));
    out.push(...await checkLayout(page, roundFile));
    const filled = await page.evaluate(`(${fillRound})()`);
    filled.problems.forEach(p => out.push(diag('browser/interaction', p, { path: roundFile, fix: 'A template or renderer bug, not an input problem.' })));
    if (!filled.problems.length) {
      await page.reload();
      (await page.evaluate(`(${checkRestoreAndReset})()`)).forEach(p => out.push(diag('browser/persistence', p, { path: roundFile })));
    }
    await page.media('print');
    (await page.evaluate(`(${hiddenWhenPrinting})()`)).forEach(cls => out.push(diag('browser/print', `.${cls.split(' ').join('.')} is visible in print`, { path: roundFile })));
    await page.media('');
    out.push(...pageErrors(page, roundFile));
    return out;
  });
}

// ---------------------------------------------------------------- commands

const rel = file => path.relative(process.cwd(), file).replace(/\\/g, '/');

async function finalize(inputPath, { consume, browser }) {
  let prepared, built, stageDir;
  const outputs = {};
  const result = await runGates([
    { name: 'validate', run: () => { prepared = prepare(inputPath); return { diagnostics: prepared.diagnostics }; } },
    { name: 'render', run: () => {
      built = build(prepared);
      stageDir = stage(path.resolve(prepared.input.outputDir), built);
    } },
    { name: 'verify', run: () => ({ diagnostics: verifyDir(stageDir) }) },
    { name: 'browser', run: () => (browser ? browserCheck(stageDir, built.roundFile) : { status: 'skipped', diagnostics: [warn('browser/disabled', '--no-browser was passed; the page was not opened')] }) },
    { name: 'publish', run: () => {
      const outputDir = path.resolve(prepared.input.outputDir);
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, built.roundFile), built.roundHtml, 'utf8');
      fs.writeFileSync(path.join(outputDir, 'index.html'), built.indexHtml, 'utf8');
      if (consume) fs.rmSync(path.resolve(inputPath));
      Object.assign(outputs, { index: rel(path.join(outputDir, 'index.html')), round: rel(path.join(outputDir, built.roundFile)), number: prepared.input.round.number, kind: prepared.input.round.kind });
    } },
  ]);
  if (stageDir) fs.rmSync(stageDir, { recursive: true, force: true, maxRetries: 5 });
  return receipt('planning-dossier', 'finalize', result, outputs);
}

async function main(args) {
  const [command, target] = args;
  const flags = new Set(args.slice(2));
  if (command === 'finalize' && target) return finalize(target, { consume: flags.has('--consume'), browser: !flags.has('--no-browser') });
  if (command === 'validate' && target) {
    return receipt('planning-dossier', 'validate', await runGates([{ name: 'validate', run: () => ({ diagnostics: prepare(target).diagnostics }) }]));
  }
  if (command === 'verify' && target) {
    return receipt('planning-dossier', 'verify', await runGates([{ name: 'verify', run: () => ({ diagnostics: verifyDir(target) }) }]));
  }
  if (command === 'browser-check' && target) {
    const latest = () => extractPayload(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), 'planning-data', 'index.html').manifest.rounds.at(-1).file;
    return receipt('planning-dossier', 'browser-check', await runGates([{ name: 'browser', run: () => browserCheck(path.resolve(target), latest()) }]));
  }
  process.stderr.write('Usage:\n  node render.mjs finalize <input.json> [--consume] [--no-browser]\n  node render.mjs validate <input.json>\n  node render.mjs verify <dossier-dir>\n  node render.mjs browser-check <dossier-dir>\n');
  process.exitCode = 2;
  return null;
}

const result = await main(process.argv.slice(2));
if (result) printReceipt(result);
