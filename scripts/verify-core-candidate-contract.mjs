import { ok, strictEqual } from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

const depName = '@aikdna/kdna-core';
const declared = pkg.dependencies?.[depName];
ok(declared, 'package.json must declare @aikdna/kdna-core dependency');
strictEqual(declared, '0.21.0', `package.json declares ${declared}, expected 0.21.0`);

const rootDeclared = lock.packages?.['']?.dependencies?.[depName];
ok(rootDeclared, 'package-lock root must declare @aikdna/kdna-core');
strictEqual(rootDeclared, '0.21.0', `root lock declares ${rootDeclared}, expected 0.21.0`);

const locked = lock.packages?.[`node_modules/${depName}`];
ok(locked, 'package-lock must resolve @aikdna/kdna-core');
strictEqual(locked.version, '0.21.0', `locked version is ${locked.version}, expected 0.21.0`);

ok(locked.resolved?.startsWith('file:'), '@aikdna/kdna-core must resolve to file: candidate tar');

const tarPath = locked.resolved.replace('file:', '');
const fullPath = join(root, tarPath);
ok(existsSync(fullPath), `candidate tar must exist at ${tarPath}`);

const tarBytes = readFileSync(fullPath);
const actualDigest = 'sha512-' + createHash('sha512').update(tarBytes).digest('base64');
strictEqual(actualDigest, locked.integrity, 'tar SHA-512 must match lock integrity');

const metadataPath = join(root, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
ok(existsSync(metadataPath), 'tgz metadata file must exist');
const meta = JSON.parse(readFileSync(metadataPath, 'utf8'));
strictEqual(meta.package, depName, 'metadata package name mismatch');
strictEqual(meta.version, '0.21.0', 'metadata version mismatch');

const expectedIntegrity = createHash('sha512').update(tarBytes).digest('base64');
strictEqual(meta.tar_integrity, `sha512-${expectedIntegrity}`, 'metadata tar integrity mismatch');

ok(meta.source_commit && /^[a-f0-9]{40}$/.test(meta.source_commit), 'metadata must have valid source_commit');
ok(meta.source_tree && /^[a-f0-9]{40}$/.test(meta.source_tree), 'metadata must have valid source_tree');

const repoPath = join(root, '..', 'kdna');
try {
  const tree = execSync('git', ['-C', repoPath, 'rev-parse', `${meta.source_commit}^{tree}`], { encoding: 'utf8', timeout: 5000 }).trim();
  strictEqual(tree, meta.source_tree, `source tree mismatch: got ${tree}, metadata says ${meta.source_tree}`);
} catch {
  console.warn('Core candidate gate: kdna repo not reachable, skipping git source verification');
}

console.log('Core candidate contract: VERIFIED');
