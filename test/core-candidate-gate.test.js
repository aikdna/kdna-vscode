import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'verify-core-candidate-contract.mjs');

function run(dir) {
  try { execFileSync(process.execPath, [SCRIPT], { cwd: dir, stdio: 'pipe', timeout: 15000 }); return { pass: true, msg: '' }; }
  catch (e) { return { pass: false, msg: (e.stderr || e.stdout || '').toString() }; }
}

function copy(label) {
  const d = join(tmpdir(), `kdna-gate-${label}-${process.pid}-${Date.now()}`);
  rmSync(d, { recursive: true, force: true });
  cpSync(join(import.meta.dirname, '..'), d, { recursive: true,
    filter: src => !src.includes('/node_modules') && !src.includes('/.vscode-test') && !src.includes('/out') && !src.includes('/.tmp') });
  return d;
}

test('fails: package.json declares wrong version', () => {
  const d = copy('wrong-pkg');
  const p = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
  p.dependencies['@aikdna/kdna-core'] = '0.19.0';
  writeFileSync(join(d, 'package.json'), JSON.stringify(p));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass, 'should fail'); assert.ok(r.msg.includes('FAIL'), 'should report FAIL');
});

test('fails: lock root declares wrong version', () => {
  const d = copy('wrong-lockroot');
  const l = JSON.parse(readFileSync(join(d, 'package-lock.json'), 'utf8'));
  l.packages[''].dependencies['@aikdna/kdna-core'] = '0.20.0';
  writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});

test('fails: lock version drifts', () => {
  const d = copy('wrong-lockver');
  const l = JSON.parse(readFileSync(join(d, 'package-lock.json'), 'utf8'));
  const key = 'node_modules/@aikdna/kdna-core';
  l.packages[key].version = '0.19.0';
  writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});

test('fails: resolved is not file: path', () => {
  const d = copy('no-file');
  const l = JSON.parse(readFileSync(join(d, 'package-lock.json'), 'utf8'));
  l.packages['node_modules/@aikdna/kdna-core'].resolved = 'https://registry.npmjs.org/@aikdna/kdna-core/-/kdna-core-0.21.0.tgz';
  writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});

test('fails: lock integrity tampered', () => {
  const d = copy('bad-int');
  const l = JSON.parse(readFileSync(join(d, 'package-lock.json'), 'utf8'));
  l.packages['node_modules/@aikdna/kdna-core'].integrity = 'sha512-BAD';
  writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});

test('fails: tar bytes tampered', () => {
  const d = copy('bad-tar');
  const p = join(d, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz');
  const buf = readFileSync(p); buf[buf.length - 1] = 0; writeFileSync(p, buf);
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});

test('fails: metadata integrity mismatches tar', () => {
  const d = copy('bad-meta-int');
  const mp = join(d, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
  const m = JSON.parse(readFileSync(mp, 'utf8'));
  m.tar_integrity = 'sha512-BAD'; writeFileSync(mp, JSON.stringify(m));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});

test('fails: metadata source_commit drifts', () => {
  const d = copy('bad-commit');
  const mp = join(d, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
  const m = JSON.parse(readFileSync(mp, 'utf8'));
  m.source_commit = '0'.repeat(40); writeFileSync(mp, JSON.stringify(m));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});

test('fails: metadata source_tree drifts', () => {
  const d = copy('bad-tree');
  const mp = join(d, 'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json');
  const m = JSON.parse(readFileSync(mp, 'utf8'));
  m.source_tree = '0'.repeat(40); writeFileSync(mp, JSON.stringify(m));
  const r = run(d); rmSync(d, { recursive: true, force: true });
  assert.ok(!r.pass);
});
