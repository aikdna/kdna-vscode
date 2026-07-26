import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const gate = join(root, 'scripts', 'verify-core-candidate-contract.mjs');

const argv = process.argv.slice(2);
const coreIdx = argv.indexOf('--core-repo');
const coreRepo = coreIdx >= 0 ? argv[coreIdx + 1] : (process.env.KDNA_CORE_REPO || null);

const args = coreRepo ? [gate, '--core-repo', coreRepo] : [gate];
execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
