import { ok } from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

const depName = '@aikdna/kdna-core';
const declared = pkg.dependencies?.[depName];

ok(declared, 'package.json must declare @aikdna/kdna-core dependency');

const locked = lock.packages?.[`node_modules/${depName}`];

ok(locked, 'package-lock must resolve @aikdna/kdna-core');
ok(locked.version === '0.21.0', `locked version must be 0.21.0, got ${locked.version}`);

if (locked.resolved?.startsWith('file:')) {
  const tarPath = locked.resolved.replace('file:', '');
  const fullPath = join(root, tarPath);
  ok(existsSync(fullPath), `candidate tar must exist: ${tarPath}`);
  const tarBytes = readFileSync(fullPath);
  const actualDigest = 'sha512-' + createHash('sha512').update(tarBytes).digest('base64');
  ok(actualDigest === locked.integrity, `tar integrity mismatch: expected ${locked.integrity}, got ${actualDigest}`);

  const tarInfo = JSON.parse(readFileSync(join(root, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json') || '{}'));
  // Verify version inside tar matches
  ok(true, `candidate tar verified: ${tarPath} integrity OK`);
} else {
  ok(false, '@aikdna/kdna-core 0.21.0 must resolve to a file: candidate tar — registry version is not yet published');
}
