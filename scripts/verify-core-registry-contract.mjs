import { strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Verifies the extension binds @aikdna/kdna-core to the exact published npm
// registry tarball (version, resolved URL, and sha512 integrity), so a stale or
// tampered core resolution fails the gate instead of silently shipping a
// candidate snapshot. These constants are frozen coordinates of the published
// @aikdna/kdna-core@0.21.0 registry artifact.

const depName = '@aikdna/kdna-core';
const EXPECTED_VERSION = '0.21.0';
const EXPECTED_RESOLVED =
  'https://registry.npmjs.org/@aikdna/kdna-core/-/kdna-core-0.21.0.tgz';
const EXPECTED_INTEGRITY =
  'sha512-y4AC4LlNvKsKxvIO/y14Bl62eRb0BupzvLGbXATXHX4ZUCmYhdlh6U1OL7WF+i0lCAyVJcIE7SKwhQR3uL5uxg==';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

strictEqual(pkg.dependencies?.[depName], EXPECTED_VERSION, 'FAIL: package.json version');
strictEqual(lock.packages?.['']?.dependencies?.[depName], EXPECTED_VERSION, 'FAIL: lock root version');

const locked = lock.packages?.[`node_modules/${depName}`];
if (!locked) throw new Error('FAIL: lock entry missing');
strictEqual(locked.version, EXPECTED_VERSION, 'FAIL: locked version');
strictEqual(locked.resolved, EXPECTED_RESOLVED, 'FAIL: resolved is not the published registry tarball');
strictEqual(locked.integrity, EXPECTED_INTEGRITY, 'FAIL: registry integrity mismatch');

console.log('VERIFIED_REGISTRY_BINDING');
