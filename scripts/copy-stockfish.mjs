import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'node_modules', 'stockfish', 'src');
const dst = path.join(root, 'public', 'vendor');
mkdirSync(dst, { recursive: true });
for (const f of ['stockfish-nnue-16-single.js', 'stockfish-nnue-16-single.wasm', 'nn-5af11540bbfe.nnue']) {
  cpSync(path.join(src, f), path.join(dst, f));
}
console.log('stockfish copied to public/vendor');
