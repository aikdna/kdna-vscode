import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'verify-core-candidate-contract.mjs');
const REAL_KDNA = join(import.meta.dirname, '..', '..', 'kdna');

function run(dir, extraArgs = []) {
  try { execFileSync(process.execPath, [SCRIPT, ...extraArgs], { cwd: dir, stdio: 'pipe', timeout: 30000 }); return { pass: true, msg: '' }; }
  catch (e) { return { pass: false, msg: (e.stderr || e.stdout || '').toString() }; }
}

function copy(label) {
  const d = join(tmpdir(), `kdna-gate-${label}-${process.pid}-${Date.now()}`);
  rmSync(d, { recursive: true, force: true });
  cpSync(join(import.meta.dirname, '..'), d, { recursive: true,
    filter: src => !src.includes('/node_modules') && !src.includes('/.vscode-test') && !src.includes('/out') && !src.includes('/.tmp') });
  return d;
}

test('baseline: source provenance passes with --core-repo', () => {
  const d = copy('baseline'); const r = run(d, ['--core-repo', REAL_KDNA]);
  rmSync(d, { recursive: true, force: true }); assert.ok(r.pass, r.msg);
});

test('fails: forged tar on approved path with synced integrity/unpacked — source content mismatch', () => {
  const d = copy('forged'); const approved = 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz';
  const td = join(d, '.forge'); mkdirSync(join(td, 'package'), { recursive: true });
  writeFileSync(join(td, 'package', 'package.json'), JSON.stringify({ name: '@aikdna/kdna-core', version: '0.21.0', description: 'forged content' }));
  execFileSync('tar', ['-czf', join(d, approved), '-C', td, 'package']);
  const bytes = readFileSync(join(d, approved));
  const digest = 'sha512-' + execFileSync('openssl', ['dgst', '-sha512', '-binary'], { input: bytes }).toString('base64');
  const gunzipped = execFileSync(process.execPath, ['-e', 'process.stdout.write(require("zlib").gunzipSync(require("fs").readFileSync(process.argv[1])))', join(d, approved)]);
  const unpacked = execFileSync(process.execPath, ['-e', 'console.log(require("crypto").createHash("sha256").update(require("fs").readFileSync(0)).digest("hex"))'], { input: gunzipped, encoding: 'utf8' }).trim();
  const l = JSON.parse(readFileSync(join(d, 'package-lock.json'), 'utf8')); const key = 'node_modules/@aikdna/kdna-core';
  l.packages[key].resolved = 'file:' + approved; l.packages[key].integrity = digest; writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l));
  const mp = join(d, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json'); const m = JSON.parse(readFileSync(mp, 'utf8'));
  m.tar_integrity = digest; m.unpacked_sha256 = unpacked; writeFileSync(mp, JSON.stringify(m));
  rmSync(td, { recursive: true, force: true });
  // Without --core-repo, candidate validation passes (all integrity fields match)
  const r1 = run(d); assert.ok(r1.pass, 'forged must pass candidate-only validation');
  // With --core-repo, source provenance must fail
  const r2 = run(d, ['--core-repo', REAL_KDNA]);
  rmSync(d, { recursive: true, force: true });
  assert.ok(!r2.pass, 'forged must fail source provenance');
  assert.ok(r2.msg.includes('source package content mismatch'), `must reject for content mismatch: ${r2.msg}`);
});

test('fails: --core-repo points to non-git directory', () => {
  const d = copy('badrepo'); const ng = join(d, '.not-git'); mkdirSync(ng, { recursive: true });
  const r = run(d, ['--core-repo', ng]); rmSync(d, { recursive: true, force: true }); assert.ok(!r.pass);
});

test('fails: package.json declares wrong version', () => { const d = copy('w1'); const p = JSON.parse(readFileSync(join(d,'package.json'),'utf8')); p.dependencies['@aikdna/kdna-core'] = '0.19.0'; writeFileSync(join(d,'package.json'),JSON.stringify(p)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: lock root declares wrong version', () => { const d = copy('w2'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages[''].dependencies['@aikdna/kdna-core'] = '0.20.0'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: locked version drifts', () => { const d = copy('w3'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].version = '0.19.0'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: resolved is not file: path', () => { const d = copy('w4'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].resolved = 'https://r.example.com/t.tgz'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: lock integrity tampered', () => { const d = copy('w5'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].integrity = 'sha512-BAD'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: tar bytes tampered', () => { const d = copy('w6'); const p = join(d,'fixtures/runtime-candidates/kdna-core-0.21.0.tgz'); const b = readFileSync(p); b[b.length-1] ^= 1; writeFileSync(p,b); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: metadata integrity mismatches tar', () => { const d = copy('w7'); const mp = join(d,'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json'); const m = JSON.parse(readFileSync(mp,'utf8')); m.tar_integrity = 'sha512-BAD'; writeFileSync(mp,JSON.stringify(m)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
