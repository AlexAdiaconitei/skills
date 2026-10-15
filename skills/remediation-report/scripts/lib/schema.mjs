// GENERATED from shared/schema.mjs by scripts/sync-shared.mjs. Edit the source, not this copy.
// Dependency-free validator for the JSON Schema subset our skill schemas use:
// type, enum, const, required, properties, additionalProperties (false),
// items, minItems, maxItems, uniqueItems, minLength, pattern, minimum,
// $ref to #/$defs/*, allOf, and if/then. Unsupported keywords are rejected
// up front so a schema can never silently validate less than it claims.

import { diag, pointer } from './diagnostics.mjs';

const SUPPORTED = new Set([
  '$schema', '$id', '$defs', '$comment', 'title', 'description', 'examples', 'default',
  'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'uniqueItems', 'minLength', 'pattern', 'minimum', '$ref', 'allOf', 'if', 'then',
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(value, type) {
  const actual = typeOf(value);
  return type === actual || (type === 'number' && actual === 'integer');
}

function assertSupported(schema, at = '#') {
  if (typeof schema !== 'object' || schema === null) return;
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`schema keyword "${key}" at ${at} is not supported by shared/schema.mjs`);
  }
  for (const [key, sub] of Object.entries(schema.properties || {})) assertSupported(sub, `${at}/properties/${key}`);
  for (const [key, sub] of Object.entries(schema.$defs || {})) assertSupported(sub, `${at}/$defs/${key}`);
  if (schema.items) assertSupported(schema.items, `${at}/items`);
  (schema.allOf || []).forEach((sub, i) => assertSupported(sub, `${at}/allOf/${i}`));
  if (schema.if) assertSupported(schema.if, `${at}/if`);
  if (schema.then) assertSupported(schema.then, `${at}/then`);
}

export function compile(schema) {
  assertSupported(schema);
  const resolve = ref => {
    const match = /^#\/\$defs\/(.+)$/.exec(ref);
    if (!match || !schema.$defs?.[match[1]]) throw new Error(`unresolvable $ref ${ref}`);
    return schema.$defs[match[1]];
  };

  function check(node, value, segments, out) {
    if (node.$ref) return check(resolve(node.$ref), value, segments, out);
    const at = pointer(segments);
    const describe = node.description ? ` (${node.description})` : '';

    if (node.type) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      if (!types.some(t => typeMatches(value, t))) {
        out.push(diag('schema/type', `expected ${types.join(' or ')}, got ${typeOf(value)}${describe}`, { path: at }));
        return;
      }
    }
    if ('const' in node && value !== node.const) out.push(diag('schema/const', `must be ${JSON.stringify(node.const)}`, { path: at }));
    if (node.enum && !node.enum.includes(value)) {
      out.push(diag('schema/enum', `${JSON.stringify(value)} is not one of ${node.enum.map(v => JSON.stringify(v)).join(', ')}`, { path: at }));
    }
    if (typeof value === 'string') {
      if (node.minLength !== undefined && value.trim().length < node.minLength) {
        out.push(diag('schema/empty', node.minLength === 1 ? 'must be a non-empty string' : `must have at least ${node.minLength} characters`, { path: at }));
      }
      if (node.pattern && !new RegExp(node.pattern, 'u').test(value)) {
        out.push(diag('schema/pattern', `${JSON.stringify(value)} does not match ${node.pattern}${describe}`, { path: at }));
      }
    }
    if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) {
      out.push(diag('schema/minimum', `must be >= ${node.minimum}`, { path: at }));
    }
    if (Array.isArray(value)) {
      if (node.minItems !== undefined && value.length < node.minItems) out.push(diag('schema/min-items', `needs at least ${node.minItems} item(s), has ${value.length}`, { path: at }));
      if (node.maxItems !== undefined && value.length > node.maxItems) out.push(diag('schema/max-items', `allows at most ${node.maxItems} item(s), has ${value.length}`, { path: at }));
      if (node.uniqueItems) {
        const seen = new Set();
        value.forEach((item, i) => {
          const key = JSON.stringify(item);
          if (seen.has(key)) out.push(diag('schema/duplicate-item', `duplicate item ${key}`, { path: pointer([...segments, i]) }));
          seen.add(key);
        });
      }
      if (node.items) value.forEach((item, i) => check(node.items, item, [...segments, i], out));
    }
    if (typeOf(value) === 'object') {
      for (const key of node.required || []) {
        if (!(key in value)) {
          const hint = node.properties?.[key]?.description;
          out.push(diag('schema/required', `missing required field "${key}"${hint ? ` (${hint})` : ''}`, { path: at }));
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (node.properties?.[key]) check(node.properties[key], child, [...segments, key], out);
        else if (node.additionalProperties === false) {
          const known = Object.keys(node.properties || {});
          out.push(diag('schema/unknown-field', `unknown field "${key}"`, { path: pointer([...segments, key]), fix: `Remove it or use one of: ${known.join(', ')}` }));
        } else if (typeof node.additionalProperties === 'object') check(node.additionalProperties, child, [...segments, key], out);
      }
    }
    for (const sub of node.allOf || []) check(sub, value, segments, out);
    if (node.if) {
      const probe = [];
      check(node.if, value, segments, probe);
      if (!probe.length && node.then) check(node.then, value, segments, out);
    }
  }

  return value => {
    const out = [];
    check(schema, value, [], out);
    return out;
  };
}
