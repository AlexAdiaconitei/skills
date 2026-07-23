import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.join(HERE, 'render.mjs');
const relativeOutput = `.tmp/planning-dossier-contract-${process.pid}`;
const output = path.resolve(relativeOutput);
const inputPath = path.resolve(`${relativeOutput}-input.json`);

function run(...args) {
  return spawnSync(process.execPath, [RENDERER, ...args], { cwd:process.cwd(), encoding:'utf8' });
}

function writeInput(value) {
  fs.writeFileSync(inputPath, JSON.stringify(value), 'utf8');
}

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

function base(round, currentState) {
  return {
    schemaVersion:1,
    outputDir:relativeOutput,
    dossier:{
      id:'contract-test',
      project:'Renderer test',
      title:'Contract test',
      objective:'Escape </script><script>window.pwned=true</script> and preserve planning state.',
      language:'en',
      scope:'renderer'
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
  threads:[],
  sections:[]
};
const openState = {
  status:'awaiting-decisions',
  summary:'Storage remains open.',
  decisions:[{ id:'D-01', title:'Storage strategy', status:'open', outcome:'' }],
  threads:[]
};

try {
  fs.rmSync(output, { recursive:true, force:true });
  fs.rmSync(inputPath, { force:true });

  writeInput(base(roundOne, openState));
  let result = run('--input', inputPath);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(output, 'index.html')));
  assert.ok(fs.existsSync(path.join(output, 'round-01-first-frontier.html')));

  const firstHtml = fs.readFileSync(path.join(output, 'round-01-first-frontier.html'), 'utf8');
  assert.equal(firstHtml.includes('<script>window.pwned=true</script>'), false, 'plain text must not become executable HTML');
  assert.match(firstHtml, /&lt;\/script&gt;&lt;script&gt;window\.pwned=true&lt;\/script&gt;/);

  result = run('--verify', relativeOutput);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).rounds, 1);

  writeInput(base(roundOne, openState));
  result = run('--input', inputPath);
  assert.notEqual(result.status, 0, 'an immutable round cannot be generated twice');

  const unresolvedFinal = {
    number:2, slug:'invalid-final', kind:'final', date:'2026-07-17', title:'Invalid final',
    summary:'This must fail.', status:'ready', evidence:[], decisions:[], threads:[],
    sections:[{ id:'plan', label:'Plan', title:'Plan', blocks:[{ type:'prose', paragraphs:['Not ready.'] }] }],
    finalHandoff:{ title:'Handoff', instruction:'Do not run.', startWith:'Nothing' }
  };
  writeInput(base(unresolvedFinal, openState));
  result = run('--input', inputPath);
  assert.notEqual(result.status, 0, 'final generation must reject unresolved ledger items');

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
  writeInput(base(finalRound, closedState));
  result = run('--input', inputPath);
  assert.equal(result.status, 0, result.stderr);

  result = run('--verify', relativeOutput);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).rounds, 2);

  const finalHtml = fs.readFileSync(path.join(output, 'round-02-final-plan.html'), 'utf8');
  assert.match(finalHtml, /Later enhancement/);
  assert.match(finalHtml, /Copy handoff/);
  process.stdout.write('planning-dossier renderer contract: ok\n');
} finally {
  fs.rmSync(output, { recursive:true, force:true });
  fs.rmSync(inputPath, { force:true });
}
