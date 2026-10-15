#!/usr/bin/env node
// Copies shared/*.mjs into skills/<skill>/scripts/lib/ for every skill that
// opts in by having that lib directory. Skills stay self-contained when
// installed on their own, while the code is maintained in one place.
//
//   node scripts/sync-shared.mjs          write the copies
//   node scripts/sync-shared.mjs --check  exit 1 if any copy is stale

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedDir = path.join(root, 'shared');
const check = process.argv.includes('--check');
const header = file => `// GENERATED from shared/${file} by scripts/sync-shared.mjs. Edit the source, not this copy.\n`;

const files = fs.readdirSync(sharedDir).filter(f => f.endsWith('.mjs')).sort();
const targets = fs.readdirSync(path.join(root, 'skills'))
  .map(skill => path.join(root, 'skills', skill, 'scripts', 'lib'))
  .filter(dir => fs.existsSync(dir));

const stale = [];
for (const dir of targets) {
  const expected = new Set(files);
  for (const file of files) {
    const content = header(file) + fs.readFileSync(path.join(sharedDir, file), 'utf8');
    const dest = path.join(dir, file);
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (current === content) continue;
    stale.push(path.relative(root, dest));
    if (!check) fs.writeFileSync(dest, content);
  }
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.mjs') && !expected.has(file)) {
      stale.push(`${path.relative(root, path.join(dir, file))} (orphan)`);
      if (!check) fs.rmSync(path.join(dir, file));
    }
  }
}

if (check && stale.length) {
  console.error(`Shared copies are stale; run node scripts/sync-shared.mjs:\n- ${stale.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(stale.length ? `Updated:\n- ${stale.join('\n- ')}` : 'Shared copies are up to date.');
}
