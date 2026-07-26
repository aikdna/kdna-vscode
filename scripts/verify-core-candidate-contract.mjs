import { ok, strictEqual } from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const coreRepoArg = args.indexOf('--core-repo');
const coreRepo = coreRepoArg >= 0 ? args[coreRepoArg + 1] : null;

// Verify Node and npm versions in provenance mode
if (coreRepo) {
  const nodeVer = process.versions.node;
  const npmVer = execFileSync('npm', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  strictEqual(nodeVer, '24.14.0', `FAIL: Node ${nodeVer}, expected 24.14.0`);
  strictEqual(npmVer, '11.17.0', `FAIL: npm ${npmVer}, expected 11.17.0`);
}

const SOURCE_COMMIT = '06fc87c435a6a34a4b3df8eb18e61b7297ca232a';
const SOURCE_TREE = '97058afdce4c1768656317301ea5519347a5955b';
const root = process.cwd();
const depName = '@aikdna/kdna-core';
const approvedPath = 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

strictEqual(pkg.dependencies?.[depName], '0.21.0', 'FAIL: package.json version');
strictEqual(lock.packages?.['']?.dependencies?.[depName], '0.21.0', 'FAIL: lock root');

const locked = lock.packages?.[`node_modules/${depName}`];
ok(locked, 'FAIL: lock missing');
strictEqual(locked.version, '0.21.0', 'FAIL: locked version');
strictEqual(locked.resolved, 'file:' + approvedPath, 'FAIL: resolved path');

const fullPath = join(root, approvedPath);
ok(existsSync(fullPath), 'FAIL: tar missing');

const tarBytes = readFileSync(fullPath);
const actualDigest = 'sha512-' + createHash('sha512').update(tarBytes).digest('base64');
strictEqual(actualDigest, locked.integrity, 'FAIL: tar integrity');

try { execFileSync('tar', ['-tzf', fullPath], { stdio: 'pipe', timeout: 5000 }); }
catch { throw new Error('FAIL: not valid tar'); }

const candidateUnpacked = gunzipSync(tarBytes);
const candidateUnpackedSha256 = createHash('sha256').update(candidateUnpacked).digest('hex');

const tarPkgJson = execFileSync('tar', ['-xzf', fullPath, '-O', 'package/package.json'],
  { encoding: 'utf8', timeout: 5000 }).trim();
const tarPkg = JSON.parse(tarPkgJson);
strictEqual(tarPkg.name, depName, 'FAIL: tar pkg name');
strictEqual(tarPkg.version, '0.21.0', 'FAIL: tar pkg version');

const metaPath = join(root, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
ok(existsSync(metaPath), 'FAIL: metadata missing');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
strictEqual(meta.package, depName, 'FAIL: meta package');
strictEqual(meta.version, '0.21.0', 'FAIL: meta version');
strictEqual(meta.tar_integrity, actualDigest, 'FAIL: meta tar integrity');
strictEqual(meta.unpacked_sha256, candidateUnpackedSha256,
  `FAIL: meta unpacked_sha256 ${meta.unpacked_sha256} != actual ${candidateUnpackedSha256}`);

if (!coreRepo) { console.log('VERIFIED_CANDIDATE'); process.exit(0); }

ok(existsSync(join(coreRepo, '.git')), 'FAIL: --core-repo not a git repo');
strictEqual(meta.source_commit, SOURCE_COMMIT, 'FAIL: meta source_commit');
strictEqual(meta.source_tree, SOURCE_TREE, 'FAIL: meta source_tree');

const gitTree = execFileSync('git', ['-C', coreRepo, 'rev-parse', `${SOURCE_COMMIT}^{tree}`],
  { encoding: 'utf8', timeout: 10000 }).trim();
strictEqual(gitTree, SOURCE_TREE, `FAIL: git tree mismatch`);

const workDir = mkdtempSync(join(tmpdir(), 'kdna-prov-'));
try {
  const archive = execFileSync('git', ['-C', coreRepo, 'archive', '--format=tar',
    SOURCE_COMMIT, '--', 'packages/kdna-core/'], { stdio: 'pipe', timeout: 15000 });

  // Double-pack into separate directories
  const pack1Dir = join(workDir, 'pack1');
  const pack2Dir = join(workDir, 'pack2');
  mkdirSync(join(pack1Dir, 'packages', 'kdna-core'), { recursive: true });
  mkdirSync(join(pack2Dir, 'packages', 'kdna-core'), { recursive: true });

  execFileSync('tar', ['-xf', '-', '-C', pack1Dir], { input: archive, stdio: 'pipe', timeout: 10000 });
  const archive2 = execFileSync('git', ['-C', coreRepo, 'archive', '--format=tar',
    SOURCE_COMMIT, '--', 'packages/kdna-core/'], { stdio: 'pipe', timeout: 15000 });
  execFileSync('tar', ['-xf', '-', '-C', pack2Dir], { input: archive2, stdio: 'pipe', timeout: 10000 });

  const core1 = join(pack1Dir, 'packages', 'kdna-core');
  const core2 = join(pack2Dir, 'packages', 'kdna-core');

  const pack1Out = execFileSync('npm', ['pack', '--json', '--ignore-scripts'],
    { cwd: core1, encoding: 'utf8', timeout: 30000 }).trim();
  const pack2Out = execFileSync('npm', ['pack', '--json', '--ignore-scripts'],
    { cwd: core2, encoding: 'utf8', timeout: 30000 }).trim();

  const pack1Info = JSON.parse(pack1Out);
  const pack2Info = JSON.parse(pack2Out);

  ok(pack1Info.length > 0, 'FAIL: pack 1 empty');
  ok(pack2Info.length > 0, 'FAIL: pack 2 empty');

  strictEqual(pack1Info[0].filename, pack2Info[0].filename, 'FAIL: pack filenames differ');
  strictEqual(pack1Info[0].size, pack2Info[0].size, 'FAIL: pack sizes differ');

  const pack1Bytes = readFileSync(join(core1, pack1Info[0].filename));
  const pack2Bytes = readFileSync(join(core2, pack2Info[0].filename));

  strictEqual(createHash('sha256').update(pack1Bytes).digest('hex'),
              createHash('sha256').update(pack2Bytes).digest('hex'),
              'FAIL: double-pack not deterministic');

  const pack1Unpacked = gunzipSync(pack1Bytes);
  const pack1Sha256 = createHash('sha256').update(pack1Unpacked).digest('hex');

  strictEqual(pack1Sha256, candidateUnpackedSha256,
    `FAIL: source package content mismatch (source: ${pack1Sha256}, candidate: ${candidateUnpackedSha256})`);

} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log('VERIFIED');
