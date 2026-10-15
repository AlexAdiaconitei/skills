// Typed diagnostics shared by every skill renderer.
//
// A diagnostic tells the agent exactly what failed and where, so a repair can
// target one field instead of regenerating the whole input:
//   { code, severity, path, message, fix? }
// `code` is a stable `area/kind` slug, `path` a JSON pointer into the input
// (or a file/selector for output checks), `fix` a concrete next action.

export function diag(code, message, { path = '', severity = 'error', fix } = {}) {
  const d = { code, severity, path, message };
  if (fix) d.fix = fix;
  return d;
}

export const warn = (code, message, opts = {}) => diag(code, message, { ...opts, severity: 'warning' });

export const hasErrors = diagnostics => diagnostics.some(d => d.severity === 'error');

export class DiagnosticError extends Error {
  constructor(diagnostics) {
    const list = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
    super(list.map(d => `${d.code}: ${d.message}`).join('; '));
    this.diagnostics = list;
  }
}

export function pointer(segments) {
  return segments.length ? '/' + segments.map(s => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '';
}

// Runs gates in order and stops at the first failure. Each gate returns
// { status?, diagnostics? } or throws; a DiagnosticError keeps its diagnostics.
// Status is pass | fail | skipped | not-run.
export async function runGates(gates) {
  const results = [];
  let ok = true;
  for (const gate of gates) {
    if (!ok) { results.push({ name: gate.name, status: 'not-run', diagnostics: [] }); continue; }
    let diagnostics = [];
    let status;
    try {
      const result = (await gate.run()) || {};
      diagnostics = result.diagnostics || [];
      status = result.status || (hasErrors(diagnostics) ? 'fail' : 'pass');
    } catch (error) {
      diagnostics = error instanceof DiagnosticError
        ? error.diagnostics
        : [diag('internal/exception', error?.message || String(error), { fix: 'Report this renderer failure; it is not caused by the input.' })];
      status = 'fail';
    }
    if (status === 'fail') ok = false;
    results.push({ name: gate.name, status, diagnostics });
  }
  return { ok, gates: results };
}

export function receipt(tool, command, { ok, gates }, outputs = {}) {
  const all = gates.flatMap(g => g.diagnostics);
  const failed = gates.find(g => g.status === 'fail');
  const skipped = gates.filter(g => g.status === 'skipped').map(g => g.name);
  const summary = ok
    ? `${command} passed${skipped.length ? ` (skipped: ${skipped.join(', ')})` : ''}`
    : `${command} failed at ${failed.name}: ${failed.diagnostics.filter(d => d.severity === 'error').length} error(s)`;
  return {
    tool, command, ok, summary,
    errors: all.filter(d => d.severity === 'error').length,
    warnings: all.filter(d => d.severity === 'warning').length,
    gates: gates.map(g => ({ name: g.name, status: g.status, diagnostics: g.diagnostics })),
    outputs,
  };
}

export function printReceipt(r) {
  process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  if (!r.ok) process.exitCode = 1;
}
