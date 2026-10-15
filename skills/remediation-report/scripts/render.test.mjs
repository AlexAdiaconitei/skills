import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.join(HERE, 'render.mjs');
const LOCALES = path.join(HERE, '..', 'locales');
const dir = `.tmp/remediation-report-contract-${process.pid}`;
const output = `${dir}/remediation-auth.html`;
const inputPath = path.resolve(`${dir}-input.json`);

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
const codes = receipt => receipt.gates.flatMap(gate => gate.diagnostics.map(d => d.code));
const gate = (receipt, name) => receipt.gates.find(g => g.name === name);

function finding(id, severity, effort, extra = {}) {
  return {
    id, severity, effort,
    title:`Problem in \`handler-${id}\``,
    problem:['Escape <script>window.pwned=true</script> and keep $& literal.'],
    files:['apps/api/src/very/long/path/that/should/wrap/inside/its/card/without/overflowing/the/page.ts:42'],
    plan:['Change `guard()`.', 'Add a test.'],
    acceptance:'`npm test -- auth` passes.',
    ...extra
  };
}

function base(overrides = {}) {
  return {
    schemaVersion:1,
    output,
    report:{
      id:'auth-review', language:'es', project:'Acme', type:'Revisión de seguridad', reference:'PR #12',
      title:'Plan de corrección:', topic:'auth', date:'2026-10-15', branch:'feature/auth', scope:'`apps/api`',
      stamp:{ text:'Pre-merge · rama', tone:'urgent' },
      verdict:'**Estructuralmente sólido**, con un bloqueante.'
    },
    phases:[
      { title:'Bloqueantes', when:'Antes del merge', intro:'Lo que impide mergear.', findings:[finding('F-01', 'critical', '~30 min')] },
      { title:'Robustez', when:'Esta iteración', intro:'Endurecer.', findings:[
        finding('F-02', 'medium', '~1,5 h', { decision:{ summary:'Rechazar o registrar.', recommendation:'Rechazar.' } }),
        finding('F-03', 'medium', '~15 min')
      ] }
    ],
    executionOrder:[
      { commit:'1 · guards', findings:['F-01', 'F-02'], rationale:'Misma superficie.', verification:'`npm test`' },
      { commit:'2 · cleanup', findings:['F-03'], rationale:'Aislado.', verification:'inspección' }
    ],
    ...overrides
  };
}

try {
  fs.rmSync(dir, { recursive:true, force:true });
  fs.mkdirSync(path.dirname(inputPath), { recursive:true });

  const reference = Object.keys(JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8'))).sort();
  for (const file of fs.readdirSync(LOCALES)) {
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8'))).sort(), reference, `${file} keys differ from en.json`);
  }

  // Schema and cross-field diagnostics.
  let input = base();
  input.phases[0].findings[0].severty = 'critical';
  input.phases[0].findings[0].effort = 'half a day';
  let result = finalize(input);
  assert.equal(result.status, 1);
  const paths = gate(result.receipt, 'validate').diagnostics.map(d => `${d.code} ${d.path}`);
  assert.ok(paths.includes('schema/unknown-field /phases/0/findings/0/severty'), paths.join('\n'));
  assert.ok(paths.includes('schema/pattern /phases/0/findings/0/effort'), paths.join('\n'));
  assert.equal(fs.existsSync(output), false, 'a failed validation must not publish anything');

  input = base({ executionOrder:[{ commit:'1', findings:['F-01', 'F-09'], rationale:'r', verification:'v' }] });
  result = finalize(input);
  assert.ok(codes(result.receipt).includes('report/unknown-finding'));
  assert.ok(codes(result.receipt).includes('report/unscheduled-finding'));

  // A valid report publishes with computed tally, totals and anchors.
  result = finalize(base());
  assert.equal(result.status, 0, JSON.stringify(result.receipt, null, 2));
  assert.ok(['pass', 'skipped'].includes(gate(result.receipt, 'browser').status));
  if (gate(result.receipt, 'browser').status === 'skipped') process.stdout.write('note: browser gate skipped (no Chrome or Node < 22)\n');
  assert.equal(result.receipt.outputs.effort, '2,5 h');
  let html = fs.readFileSync(output, 'utf8');
  assert.equal(html.includes('<script>window.pwned=true</script>'), false, 'plain text must not become executable HTML');
  assert.match(html, /keep \$&amp; literal/);
  assert.match(html, /<code>guard\(\)<\/code>/);
  assert.match(html, /<strong>Estructuralmente sólido<\/strong>/);
  assert.match(html, /3 \(1 bloqueantes\)/);
  assert.match(html, /Plan \(opción recomendada\)/);
  assert.equal(html.includes('class="cell l"'), false, 'tally shows only the severities present');
  assert.match(html, /Solo revisión/);
  assert.equal(html.includes('<th>Estado</th>'), false);

  // Update after fixes: extract, mark one finding resolved, re-render in place.
  result = run('extract', output, '--to', inputPath);
  assert.equal(result.status, 0, result.stdout);
  input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  input.phases[0].findings[0].resolution = 'Added `guard()`; `npm test -- auth` passes.';
  result = finalize(input);
  assert.equal(result.status, 0, JSON.stringify(result.receipt, null, 2));
  assert.equal(result.receipt.outputs.resolved, 1);
  html = fs.readFileSync(output, 'utf8');
  assert.match(html, /<th>Estado<\/th>/);
  assert.match(html, /Parcial/);
  assert.match(html, /Corrección en curso — 1\/3/);
  assert.match(html, /`npm test -- auth` passes\.|<code>npm test -- auth<\/code> passes\./);

  result = run('verify', output);
  assert.equal(result.status, 0, result.stdout);

  // Another report cannot overwrite this one.
  result = finalize(base({ report:{ ...base().report, id:'other-review' } }));
  assert.ok(codes(result.receipt).includes('report/id-mismatch'));
  process.stdout.write('remediation-report renderer contract: ok\n');
} finally {
  fs.rmSync(dir, { recursive:true, force:true });
  fs.rmSync(inputPath, { force:true });
}
