import { ok, strictEqual } from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createGunzip } from 'node:zlib';

const args = process.argv.slice(2);
const coreRepoArg = args.indexOf('--core-repo');
const coreRepo = coreRepoArg >= 0 ? args[coreRepoArg + 1] : null;
const SOURCE_COMMIT = '06fc87c435a6a34a4b3df8eb18e61b7297ca232a';
const SOURCE_TREE = '97058afdce4c1768656317301ea5519347a5955b';

const root = process.cwd();
const depName = '@aikdna/kdna-core';
const approvedPath = 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

strictEqual(pkg.dependencies?.[depName], '0.21.0', 'FAIL: package.json version');
strictEqual(lock.packages?.['']?.dependencies?.[depName], '0.21.0', 'FAIL: lock root version');

const locked = lock.packages?.[`node_modules/${depName}`];
ok(locked, 'FAIL: lock missing ' + depName);
strictEqual(locked.version, '0.21.0', 'FAIL: locked version');
strictEqual(locked.resolved, 'file:' + approvedPath, 'FAIL: resolved path');

const fullPath = join(root, approvedPath);
ok(existsSync(fullPath), 'FAIL: tar missing');

const tarBytes = readFileSync(fullPath);
const actualDigest = 'sha512-' + createHash('sha512').update(tarBytes).digest('base64');
strictEqual(actualDigest, locked.integrity, 'FAIL: tar integrity mismatch');

try { execFileSync('tar', ['-tzf', fullPath], { stdio: 'pipe', timeout: 5000 }); }
catch { throw new Error('FAIL: not valid tar'); }

const tarPkgJson = execFileSync('tar', ['-xzf', fullPath, '-O', 'package/package.json'],
  { encoding: 'utf8', timeout: 5000 }).trim();
let tarPkg;
try { tarPkg = JSON.parse(tarPkgJson); } catch { throw new Error('FAIL: tar pkg.json invalid JSON'); }
strictEqual(tarPkg.name, depName, 'FAIL: tar pkg name');
strictEqual(tarPkg.version, '0.21.0', 'FAIL: tar pkg version');

const metaPath = join(root, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
ok(existsSync(metaPath), 'FAIL: metadata missing');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
strictEqual(meta.package, depName, 'FAIL: meta package name');
strictEqual(meta.version, '0.21.0', 'FAIL: meta version');
strictEqual(meta.tar_integrity, actualDigest, 'FAIL: meta tar integrity');

if (!coreRepo) {
  console.log('VERIFIED_CANDIDATE');
  process.exit(0);
}

ok(existsSync(join(coreRepo, '.git')), 'FAIL: --core-repo not a git repo');
strictEqual(meta.source_commit, SOURCE_COMMIT, 'FAIL: meta source_commit');
strictEqual(meta.source_tree, SOURCE_TREE, 'FAIL: meta source_tree');

const gitTree = execFileSync('git', ['-C', coreRepo, 'rev-parse', `${SOURCE_COMMIT}^{tree}`],
  { encoding: 'utf8', timeout: 10000 }).trim();
strictEqual(gitTree, SOURCE_TREE, `FAIL: git tree ${gitTree} != ${SOURCE_TREE}`);

const workDir = mkdtempSync(join(tmpdir(), 'kdna-prov-'));
try {
  const archive = execFileSync('git', ['-C', coreRepo, 'archive', '--format=tar',
    SOURCE_COMMIT, '--', 'packages/kdna-core/'], { stdio: 'pipe', timeout: 15000 });
  execFileSync('tar', ['-xf', '-', '-C', workDir], { input: archive, stdio: 'pipe', timeout: 10000 });

  const coreDir = join(workDir, 'packages', 'kdna-core');
  ok(existsSync(join(coreDir, 'package.json')), 'FAIL: source missing package.json');

  execFileSync('npm', ['pack', '--ignore-scripts'], { cwd: coreDir, stdio: 'pipe', timeout: 30000 });
  const packFiles = execFileSync('find', [coreDir, '-name', '*.tgz', '-maxdepth', '1', '-print0'],
    { encoding: 'utf8', timeout: 5000 }).split('\0').filter(Boolean);

  ok(packFiles.length >= 1, 'FAIL: npm pack produced no tarball');
  const { gunzipSync } = await import('node:zlib');
  const sourcePack = readFileSync(packFiles[0]);
  const sourceUnpacked = gunzipSync(sourcePack);
  const candidateUnpacked = gunzipSync(readFileSync(fullPath));

  strictEqual(createHash('sha256').update(sourceUnpacked).digest('hex'),
              createHash('sha256').update(candidateUnpacked).digest('hex'),
              'FAIL: source package content mismatch');

} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log('VERIFIED');
