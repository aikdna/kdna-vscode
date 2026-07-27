import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'verify-core-candidate-contract.mjs');

function run(dir, extraArgs = []) {
  try { execFileSync(process.execPath, [SCRIPT, ...extraArgs], { cwd: dir, stdio: 'pipe', timeout: 30000 }); return { pass: true, msg: '' }; }
  catch (e) { return { pass: false, msg: (e.stderr || e.stdout || '').toString() }; }
}

function copy(label) {
  const d = join(tmpdir(), `pv-${label}-${process.pid}-${Date.now()}`);
  rmSync(d, { recursive: true, force: true });
  cpSync(join(import.meta.dirname, '..'), d, { recursive: true,
    filter: src => !src.includes('/node_modules') && !src.includes('/.vscode-test') && !src.includes('/out') && !src.includes('/.tmp') });
  return d;
}

import { resolve } from 'node:path';
const CORE_REPO = process.env.KDNA_CORE_REPO ? resolve(process.env.KDNA_CORE_REPO) : null;
if (!CORE_REPO) throw new Error('KDNA_CORE_REPO must be set to run provenance tests');

test('baseline: source provenance passes', () => {
  const d = copy('baseline'); const r = run(d, ['--core-repo', CORE_REPO]);
  rmSync(d, { recursive: true, force: true }); assert.ok(r.pass, r.msg || 'baseline provenance failed');
});

test('fails: forged tar on approved path synced all digests — source content mismatch', () => {
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
  const r1 = run(d); assert.ok(r1.pass, 'candidate-only must pass');
  const r2 = run(d, ['--core-repo', CORE_REPO]);
  rmSync(d, { recursive: true, force: true });
  assert.ok(!r2.pass, 'provenance must fail');
  assert.ok(r2.msg.includes('source package content mismatch'), `must report content mismatch: ${r2.msg}`);
});

test('fails: --core-repo points to non-git directory', () => {
  const d = copy('badrepo'); const ng = join(d, '.not-git'); mkdirSync(ng, { recursive: true });
  const r = run(d, ['--core-repo', ng]); rmSync(d, { recursive: true, force: true }); assert.ok(!r.pass);
});
