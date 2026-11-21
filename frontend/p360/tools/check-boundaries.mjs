// Enforces the service-library boundaries. Run: npm run check:boundaries
//   - shell      may import any library
//   - licensing  may be imported by any library (everyone needs to know what is licensed)
//   - shared     may be imported by any library, and imports nothing but itself
//   - every other library imports only itself, @p360/shared and @p360/licensing
// Relative imports must stay inside the library they start in.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', 'projects');
const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function* files(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.ts')) yield p;
  }
}

const libOf = (p) => relative(ROOT, p).split(sep)[0];
const allowed = (from, to) =>
  from === to || from === 'shell' || to === 'shared' || (to === 'licensing' && from !== 'shared');

const errors = [];
for (const file of files(ROOT)) {
  const lib = libOf(file);
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    let target = null;
    if (spec.startsWith('.')) target = libOf(resolve(dirname(file), spec));
    else if (spec.startsWith('@p360/')) target = spec.split('/')[1];
    if (target && !allowed(lib, target))
      errors.push(`${relative(ROOT, file)}: '${spec}' (${lib} -> ${target})`);
  }
}

if (errors.length) {
  console.error(`Library boundary violations (${errors.length}):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log('Library boundaries OK.');
