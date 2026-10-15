import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.join(HERE, 'render.mjs');
const LOCALES = path.join(HERE, '..', 'locales');
const relativeOutput = `.tmp/planning-dossier-contract-${process.pid}`;
const output = path.resolve(relativeOutput);
const inputPath = path.resolve(`${relativeOutput}-input.json`);

function run(...args) {
  const result = spawnSync(process.execPath, [RENDERER, ...args], { cwd:process.cwd(), encoding:'utf8' });
  let receipt = null;
  try { receipt = JSON.parse(result.stdout); } catch { /* usage errors print no receipt */ }
  return { ...result, receipt };
}
function finalize(value) {
  fs.writeFileSync(inputPath, JSON.stringify(value), 'utf8');
  return run('finalize', inputPath);
}
function codes(receipt) { return receipt.gates.flatMap(gate => gate.diagnostics.map(d => d.code)); }
function gate(receipt, name) { return receipt.gates.find(g => g.name === name); }

function option(id, label) {
  return {
    id,
    label,
    summary:`Use ${label}.`,
    tradeoffs:['Explicit tradeoff'],
    surfaces:['src/example.ts'],
    reversibility:'high',
    complexity:'S',
    uncertainty:'low'
  };
}

function base(round, currentState, dossier = {}) {
  return {
    schemaVersion:1,
    outputDir:relativeOutput,
    dossier:{
      id:'contract-test',
      project:'Renderer test',
      title:'Contract test',
      objective:'Escape </script><script>window.pwned=true</script> and preserve $& planning state.',
      language:'en',
      scope:'renderer',
      ...dossier
    },
    round,
    currentState
  };
}

const roundOne = {
  number:1,
  slug:'first-frontier',
  kind:'round',
  date:'2026-07-17',
  title:'First frontier',
  summary:'One material decision is open.',
  status:'awaiting-decisions',
  evidence:[{ title:'Observed contract', detail:'The renderer uses plain text.', refs:['scripts/render.mjs'] }],
  decisions:[{
    id:'D-01',
    criticality:'material',
    title:'Storage strategy',
    question:'Where should state live?',
    rationale:'The choice affects continuity.',
    mode:'single',
    recommendation:'local',
    options:[option('local','Local state'), option('remote','Remote state')],
    notesPrompt:'Constraint or correction'
  }],
  threads:[{ id:'T-01', criticality:'watch', title:'Open question', detail:'Needs an answer.', status:'open' }],
  sections:[]
};
const openState = {
  status:'awaiting-decisions',
  summary:'Storage remains open.',
  decisions:[{ id:'D-01', title:'Storage strategy', status:'open', outcome:'' }],
  threads:[{ id:'T-01', title:'Open question', criticality:'watch', status:'open' }]
};

try {
  fs.rmSync(output, { recursive:true, force:true });
  fs.mkdirSync(path.dirname(inputPath), { recursive:true });

  // Locale files share one key set.
  const reference = Object.keys(JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8'))).sort();
  for (const file of fs.readdirSync(LOCALES)) {
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8'))).sort(), reference, `${file} keys differ from en.json`);
  }

  // Schema diagnostics point at the exact field and nothing is written.
  let bad = base({ ...roundOne, decisions:[{ ...roundOne.decisions[0], recommendation:'missing', colour:'red' }] }, openState);
  let result = finalize(bad);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.ok, false);
  const unknown = gate(result.receipt, 'validate').diagnostics.find(d => d.code === 'schema/unknown-field');
  assert.equal(unknown.path, '/round/decisions/0/colour');
  assert.equal(gate(result.receipt, 'render').status, 'not-run');
  assert.equal(fs.existsSync(output), false, 'a failed validation must not publish anything');

  bad = base({ ...roundOne, decisions:[{ ...roundOne.decisions[0], recommendation:'missing' }] }, openState);
  result = finalize(bad);
  assert.deepEqual(codes(result.receipt), ['dossier/unknown-recommendation']);

  result = finalize(base(roundOne, { ...openState, threads:[] }));
  assert.ok(codes(result.receipt).includes('dossier/ledger-missing'), 'round items must appear in the ledger');

  // A valid first round publishes, escapes text, and passes the browser gate when one is available.
  result = finalize(base(roundOne, openState));
  assert.equal(result.status, 0, JSON.stringify(result.receipt, null, 2));
  assert.equal(result.receipt.outputs.number, 1);
  assert.ok(['pass', 'skipped'].includes(gate(result.receipt, 'browser').status));
  if (gate(result.receipt, 'browser').status === 'skipped') process.stdout.write('note: browser gate skipped (no Chrome or Node < 22)\n');
  assert.ok(fs.existsSync(path.join(output, 'index.html')));
  const firstHtml = fs.readFileSync(path.join(output, 'round-01-first-frontier.html'), 'utf8');
  assert.equal(firstHtml.includes('<script>window.pwned=true</script>'), false, 'plain text must not become executable HTML');
  assert.match(firstHtml, /&lt;\/script&gt;&lt;script&gt;window\.pwned=true&lt;\/script&gt;/);
  assert.match(firstHtml, /preserve \$&amp; planning/, 'replacement patterns in text must stay literal');

  result = run('verify', relativeOutput);
  assert.equal(result.status, 0, result.stdout);

  result = finalize(base(roundOne, openState));
  assert.ok(codes(result.receipt).includes('dossier/round-sequence'));
  assert.ok(codes(result.receipt).includes('dossier/round-exists'), 'an immutable round cannot be generated twice');

  const unresolvedFinal = {
    number:2, slug:'invalid-final', kind:'final', date:'2026-07-17', title:'Invalid final',
    summary:'This must fail.', status:'ready', evidence:[], decisions:[], threads:[],
    sections:[{ id:'plan', label:'Plan', title:'Plan', blocks:[{ type:'prose', paragraphs:['Not ready.'] }] }],
    finalHandoff:{ title:'Handoff', instruction:'Do not run.', startWith:'Nothing' }
  };
  result = finalize(base(unresolvedFinal, openState));
  assert.ok(codes(result.receipt).includes('dossier/final-unresolved'), 'final generation must reject unresolved ledger items');

  result = finalize(base({ ...unresolvedFinal, slug:'dropped' }, { ...openState, decisions:[], threads:[] }));
  assert.ok(codes(result.receipt).includes('dossier/ledger-removed'), 'prior ledger IDs cannot disappear');

  // A language without a locale file falls back to English and says so.
  const finalRound = {
    number:2, slug:'final-plan', kind:'final', date:'2026-07-17', title:'Final plan',
    summary:'The decision is closed.', status:'ready', evidence:[], decisions:[],
    threads:[{
      id:'T-01', criticality:'watch', title:'Later enhancement', detail:'Explicitly deferred.', status:'deferred',
      reason:'Outside scope.', impact:'No enhancement in v1.', reactivation:'After rollout'
    }],
    sections:[{ id:'plan', label:'Plan', title:'Executable plan', blocks:[{ type:'steps', items:['Change the contract.', 'Verify the observable behavior.'] }] }],
    finalHandoff:{ title:'Implementation handoff', instruction:'Read the final dossier and implement in phase order.', startWith:'Contract change' }
  };
  const closedState = {
    status:'ready',
    summary:'The plan is ready.',
    decisions:[{ id:'D-01', title:'Storage strategy', status:'decided', outcome:'Local state' }],
    threads:[{ id:'T-01', title:'Later enhancement', criticality:'watch', status:'deferred', outcome:'After rollout' }]
  };
  result = finalize(base(finalRound, closedState, { language:'fr', labels:{ copyHandoff:'Copier le handoff' } }));
  assert.equal(result.status, 0, JSON.stringify(result.receipt, null, 2));
  assert.ok(codes(result.receipt).includes('i18n/fallback'));

  result = run('verify', relativeOutput);
  assert.equal(result.status, 0, result.stdout);

  const finalHtml = fs.readFileSync(path.join(output, 'round-02-final-plan.html'), 'utf8');
  assert.match(finalHtml, /Later enhancement/);
  assert.match(finalHtml, /Copier le handoff/);
  assert.match(finalHtml, /lang="fr"/);
  process.stdout.write('planning-dossier renderer contract: ok\n');
} finally {
  fs.rmSync(output, { recursive:true, force:true });
  fs.rmSync(inputPath, { force:true });
}
