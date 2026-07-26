import { ok, strictEqual } from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const coreRepoArg = args.indexOf('--core-repo');
const coreRepo = coreRepoArg >= 0 ? args[coreRepoArg + 1] : null;

const root = process.cwd();
const depName = '@aikdna/kdna-core';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

const declared = pkg.dependencies?.[depName];
ok(declared, 'FAIL: package.json must declare ' + depName);
strictEqual(declared, '0.21.0', `FAIL: pkg declares ${declared}, expected 0.21.0`);

const rootDeclared = lock.packages?.['']?.dependencies?.[depName];
ok(rootDeclared, 'FAIL: lock root missing ' + depName);
strictEqual(rootDeclared, '0.21.0', `FAIL: lock root declares ${rootDeclared}`);

const locked = lock.packages?.[`node_modules/${depName}`];
ok(locked, 'FAIL: lock must resolve ' + depName);
strictEqual(locked.version, '0.21.0', `FAIL: locked version ${locked.version}`);

const expectedResolved = 'file:fixtures/runtime-candidates/kdna-core-0.21.0.tgz';
strictEqual(locked.resolved, expectedResolved, `FAIL: resolved must be ${expectedResolved}`);
ok(!locked.resolved.includes('..'), 'FAIL: path must not escape');

const fullPath = join(root, locked.resolved.replace('file:', ''));
ok(existsSync(fullPath), 'FAIL: tar missing');

const tarBytes = readFileSync(fullPath);
const actualDigest = 'sha512-' + createHash('sha512').update(tarBytes).digest('base64');
strictEqual(actualDigest, locked.integrity, 'FAIL: tar SHA-512 mismatch');

try { execFileSync('tar', ['-tzf', fullPath], { stdio: 'pipe', timeout: 5000 }); }
catch { throw new Error('FAIL: not valid tar'); }

const tarPkgJson = execFileSync('tar', ['-xzf', fullPath, '-O', 'package/package.json'],
  { encoding: 'utf8', timeout: 5000 }).trim();
let tarPkg;
try { tarPkg = JSON.parse(tarPkgJson); } catch { throw new Error('FAIL: tar pkg.json not valid JSON'); }
strictEqual(tarPkg.name, depName, `FAIL: tar name ${tarPkg.name}`);
strictEqual(tarPkg.version, '0.21.0', `FAIL: tar version ${tarPkg.version}`);

const metaPath = join(root, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
ok(existsSync(metaPath), 'FAIL: metadata missing');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
strictEqual(meta.package, depName, 'FAIL: meta package mismatch');
strictEqual(meta.version, '0.21.0', 'FAIL: meta version mismatch');
strictEqual(meta.tar_integrity, actualDigest, 'FAIL: meta tar integrity mismatch');
ok(/^[a-f0-9]{40}$/.test(meta.source_commit || ''), 'FAIL: meta missing valid source_commit');
ok(/^[a-f0-9]{40}$/.test(meta.source_tree || ''), 'FAIL: meta missing valid source_tree');

if (!coreRepo) {
  console.log('VERIFIED_CANDIDATE (source provenance skipped: --core-repo not provided)');
  process.exit(0);
}

ok(existsSync(join(coreRepo, '.git')), 'FAIL: --core-repo is not a git repository');
const gitTree = execFileSync('git', ['-C', coreRepo, 'rev-parse', `${meta.source_commit}^{tree}`],
  { encoding: 'utf8', timeout: 10000 }).trim();
strictEqual(gitTree, meta.source_tree,
  `FAIL: git tree ${gitTree} != meta ${meta.source_tree}`);

try {
  execFileSync('git', ['-C', coreRepo, 'archive', '--format=tar', meta.source_commit,
    '--', 'packages/kdna-core/'], { stdio: 'pipe', timeout: 15000 });
} catch { throw new Error('FAIL: cannot archive Core source from git'); }

const sourceTar = execFileSync('git', ['-C', coreRepo, 'archive', '--format=tar',
  meta.source_commit, '--', 'packages/kdna-core/package.json'], { stdio: 'pipe', timeout: 15000 });
const sourcePkgJson = execFileSync('tar', ['-xOf', '-', 'packages/kdna-core/package.json'],
  { input: sourceTar, encoding: 'utf8', timeout: 5000 }).trim();
let sourcePkg;
try { sourcePkg = JSON.parse(sourcePkgJson); } catch { throw new Error('FAIL: source pkg.json not valid'); }
strictEqual(sourcePkg.name, depName, 'FAIL: source pkg name mismatch');
strictEqual(sourcePkg.version, '0.21.0', 'FAIL: source pkg version mismatch');

console.log('VERIFIED');
