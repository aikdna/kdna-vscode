import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'verify-core-registry-contract.mjs');

function run(dir) {
  try { execFileSync(process.execPath, [SCRIPT], { cwd: dir, stdio: 'pipe', timeout: 15000 }); return { pass: true }; }
  catch (e) { return { pass: false, msg: (e.stderr || e.stdout || '').toString() }; }
}

function copy(label) {
  const d = join(tmpdir(), `gr-${label}-${process.pid}-${Date.now()}`);
  rmSync(d, { recursive: true, force: true });
  cpSync(join(import.meta.dirname, '..'), d, { recursive: true,
    filter: src => !src.includes('/node_modules') && !src.includes('/.vscode-test') && !src.includes('/out') && !src.includes('/.tmp') });
  return d;
}

test('passes: bound to the published registry tarball', () => {
  const d = copy('ok'); const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(r.pass, r.msg || 'baseline registry binding failed');
});

test('fails: package.json declares wrong version', () => { const d = copy('w1'); const p = JSON.parse(readFileSync(join(d,'package.json'),'utf8')); p.dependencies['@aikdna/kdna-core'] = '0.19.0'; writeFileSync(join(d,'package.json'),JSON.stringify(p)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: lock root declares wrong version', () => { const d = copy('w2'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages[''].dependencies['@aikdna/kdna-core'] = '0.20.0'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: locked version drifts', () => { const d = copy('w3'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].version = '0.19.0'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: resolved drifts back to a file: candidate', () => { const d = copy('w4'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].resolved = 'file:fixtures/runtime-candidates/kdna-core-0.21.0.tgz'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: resolved drifts to a non-registry host', () => { const d = copy('w5'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].resolved = 'https://r.example.com/@aikdna/kdna-core/-/kdna-core-0.21.0.tgz'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: resolved drifts to a different package tarball', () => { const d = copy('w6'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].resolved = 'https://registry.npmjs.org/@aikdna/kdna-core/-/kdna-core-0.19.0.tgz'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: integrity tampered', () => { const d = copy('w7'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].integrity = 'sha512-BAD'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: integrity drifts to a non-sha512 algorithm', () => { const d = copy('w8'); const l = JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].integrity = 'sha1-deadbeef'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
