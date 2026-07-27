import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const lockPath = join(root, 'package-lock.json');

if (!existsSync(lockPath)) {
  console.log('RELEASE_BLOCKED: no lockfile');
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const dep = lock.packages?.['node_modules/@aikdna/kdna-core'];

if (!dep) {
  console.log('RELEASE_BLOCKED: @aikdna/kdna-core not in lock');
  process.exit(1);
}

if (dep.resolved?.startsWith('file:')) {
  console.log(`RELEASE_BLOCKED: @aikdna/kdna-core resolves to file: candidate — cannot publish until registry version exists`);
  process.exit(1);
}

if (!dep.resolved?.startsWith('https://registry.npmjs.org/')) {
  console.log(`RELEASE_BLOCKED: @aikdna/kdna-core has no established registry authority`);
  process.exit(1);
}

if (dep.version !== '0.21.0') {
  console.log(`RELEASE_BLOCKED: unexpected @aikdna/kdna-core version ${dep.version}`);
  process.exit(1);
}

console.log('RELEASE_READY');
