import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('fails: package.json declares wrong version', () => { const d = copy('w1'); const p=JSON.parse(readFileSync(join(d,'package.json'),'utf8')); p.dependencies['@aikdna/kdna-core']='0.19.0'; writeFileSync(join(d,'package.json'),JSON.stringify(p)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: lock root declares wrong version', () => { const d = copy('w2'); const l=JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages[''].dependencies['@aikdna/kdna-core']='0.20.0'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: locked version drifts', () => { const d = copy('w3'); const l=JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].version='0.19.0'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: resolved is not file: path', () => { const d = copy('w4'); const l=JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].resolved='https://r.example.com/t.tgz'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: lock integrity tampered', () => { const d = copy('w5'); const l=JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].integrity='sha512-BAD'; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: tar bytes tampered', () => { const d = copy('w6'); const p=join(d,'fixtures/runtime-candidates/kdna-core-0.21.0.tgz'); const b=readFileSync(p); b[b.length-1]^=1; writeFileSync(p,b); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: metadata integrity mismatches tar', () => { const d = copy('w7'); const mp=join(d,'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json'); const m=JSON.parse(readFileSync(mp,'utf8')); m.tar_integrity='sha512-BAD'; writeFileSync(mp,JSON.stringify(m)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
test('fails: forged tar with correct name/version but wrong content', () => { const d = copy('forged'); const tp=join(d,'fixtures/runtime-candidates/kdna-core-0.21.0.tgz'); const nt=join(d,'fixtures/runtime-candidates/forged.tgz'); const td=join(d,'.forge'); execFileSync('mkdir',['-p',join(td,'package')]); writeFileSync(join(td,'package','package.json'),JSON.stringify({name:'@aikdna/kdna-core',version:'0.21.0'})); execFileSync('tar',['-czf',nt,'-C',td,'package']); const nb=readFileSync(nt); const nd=execFileSync('openssl',['dgst','-sha512','-binary'],{input:nb}).toString('base64'); const l=JSON.parse(readFileSync(join(d,'package-lock.json'),'utf8')); l.packages['node_modules/@aikdna/kdna-core'].resolved='file:fixtures/runtime-candidates/forged.tgz'; l.packages['node_modules/@aikdna/kdna-core'].integrity='sha512-'+nd; writeFileSync(join(d,'package-lock.json'),JSON.stringify(l)); const mp=join(d,'fixtures/runtime-candidates/kdna-core-0.21.0.tgz.info.json'); const ma=JSON.parse(readFileSync(mp,'utf8')); ma.tar_integrity='sha512-'+nd; writeFileSync(mp,JSON.stringify(ma)); const r=run(d); rmSync(d,{recursive:true,force:true}); assert.ok(!r.pass); });
