/* Walks dist/ after the vite build and writes a manifest of every file the
   service worker should precache on install, so the app (including the
   Stockfish engine assets) works fully offline after the first load.
   Also stamps a content hash into the copied sw.js cache name — without a
   byte change to sw.js the browser never installs the new worker and keeps
   serving the stale precached app forever. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

function walk(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (!entry.endsWith('.map') && entry !== 'sw.js') out.push(rel);
  }
  return out;
}

const files = walk(dist);
const manifest = JSON.stringify(files);
writeFileSync(path.join(dist, 'precache-manifest.json'), manifest);
console.log(`precache manifest: ${files.length} files`);

// hash paths + sizes so any asset change (e.g. new icons) produces a new
// sw.js, which is what makes the browser install the updated service worker
const hash = createHash('md5');
for (const f of files) {
  hash.update(f);
  hash.update(String(statSync(path.join(dist, f)).size));
}
const digest = hash.digest('hex').slice(0, 10);
const swPath = path.join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace(
  /const CACHE = '[^']+'/,
  `const CACHE = 'maestro-${digest}'`
);
writeFileSync(swPath, sw);
console.log(`sw cache: maestro-${digest}`);
