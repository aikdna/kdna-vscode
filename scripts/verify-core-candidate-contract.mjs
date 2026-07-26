import { ok, strictEqual } from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const depName = '@aikdna/kdna-core';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

const declared = pkg.dependencies?.[depName];
ok(declared, 'FAIL: package.json must declare ' + depName);
strictEqual(declared, '0.21.0', `FAIL: package.json declares ${declared}, expected 0.21.0`);

const rootDeclared = lock.packages?.['']?.dependencies?.[depName];
ok(rootDeclared, 'FAIL: lock root must declare ' + depName);
strictEqual(rootDeclared, '0.21.0', `FAIL: lock root declares ${rootDeclared}, expected 0.21.0`);

const locked = lock.packages?.[`node_modules/${depName}`];
ok(locked, 'FAIL: lock must resolve ' + depName);
strictEqual(locked.version, '0.21.0', `FAIL: locked version ${locked.version}, expected 0.21.0`);

ok(locked.resolved?.startsWith('file:'), 'FAIL: must resolve to file: candidate tar');
const tarRel = locked.resolved.replace('file:', '');
ok(!tarRel.includes('..') && !tarRel.startsWith('/'), 'FAIL: tar path must not escape');
const fullPath = join(root, tarRel);
ok(existsSync(fullPath), `FAIL: tar missing at ${tarRel}`);

const tarBytes = readFileSync(fullPath);
const actualDigest = 'sha512-' + createHash('sha512').update(tarBytes).digest('base64');
strictEqual(actualDigest, locked.integrity, 'FAIL: tar SHA-512 mismatch with lock');

try {
  execFileSync('tar', ['-tzf', fullPath], { stdio: 'pipe', timeout: 5000 });
} catch {
  throw new Error('FAIL: tar file is not valid tar');
}

const metaPath = join(root, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
ok(existsSync(metaPath), 'FAIL: metadata file missing');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
strictEqual(meta.package, depName, 'FAIL: metadata package name mismatch');
strictEqual(meta.version, '0.21.0', 'FAIL: metadata version mismatch');
strictEqual(meta.tar_integrity, actualDigest, 'FAIL: metadata tar integrity mismatch');
ok(/^[a-f0-9]{40}$/.test(meta.source_commit || ''), 'FAIL: metadata missing valid source_commit');
ok(/^[a-f0-9]{40}$/.test(meta.source_tree || ''), 'FAIL: metadata missing valid source_tree');

const kdnaRepo = join(root, '..', 'kdna');
ok(existsSync(join(kdnaRepo, '.git')), 'FAIL: kdna repository not reachable for source verification');
const gitTree = execFileSync('git', ['-C', kdnaRepo, 'rev-parse', `${meta.source_commit}^{tree}`],
  { encoding: 'utf8', timeout: 10000 }).trim();
strictEqual(gitTree, meta.source_tree,
  `FAIL: source tree mismatch — git ${gitTree}, metadata ${meta.source_tree}`);

try {
  execFileSync('tar', ['-xzf', fullPath, '-O', 'package/package.json'],
    { stdio: 'pipe', timeout: 5000, encoding: 'utf8' });
} catch (e) {
  throw new Error('FAIL: cannot extract package/package.json from tar');
}
const tarPkgJson = execFileSync('tar', ['-xzf', fullPath, '-O', 'package/package.json'],
  { encoding: 'utf8', timeout: 5000 }).trim();
let tarPkg;
try { tarPkg = JSON.parse(tarPkgJson); } catch {
  throw new Error('FAIL: tar package.json is not valid JSON');
}
strictEqual(tarPkg.name, depName, `FAIL: tar package name ${tarPkg.name}, expected ${depName}`);
strictEqual(tarPkg.version, '0.21.0', `FAIL: tar package version ${tarPkg.version}, expected 0.21.0`);

console.log('VERIFIED');
