#!/usr/bin/env node

/**
 * Workspace-CLI version-contract drift guard.
 *
 * The single source of truth is `src/utils/workspaceCliContract.ts`. Every
 * other surface that names the supported CLI version — source strings,
 * package.json setting description, README, CHANGELOG, and test fixtures —
 * must agree with it, and the fail-closed test matrix must keep covering the
 * neighboring versions. This prevents the historical drift class where the
 * source required version A, the README promised version B, and fixtures
 * exercised version C.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const contractSource = read('src/utils/workspaceCliContract.ts');
const versionMatch = contractSource.match(/export const WORKSPACE_CLI_VERSION = '([0-9]+\.[0-9]+\.[0-9]+)';/u);
const schemaMatch = contractSource.match(
  /export const WORKSPACE_CLI_RECORD_SCHEMA_VERSION = '([0-9]+\.[0-9]+\.[0-9]+)';/u,
);
if (!versionMatch) fail('contract file must export WORKSPACE_CLI_VERSION as one exact semver literal');
if (!schemaMatch) fail('contract file must export WORKSPACE_CLI_RECORD_SCHEMA_VERSION as one exact semver literal');
if (!versionMatch || !schemaMatch) {
  console.error('workspace CLI contract is malformed');
  process.exit(1);
}
const version = versionMatch[1];
const schemaVersion = schemaMatch[1];
const literal = new RegExp(`'0\\.36\\.[0-9]+'|"0\\.36\\.[0-9]+"`, 'gu');

const clientSource = read('src/utils/workspaceAttachments.ts');
if (literal.test(clientSource)) {
  fail('workspaceAttachments.ts hardcodes a CLI version literal; use the contract constant');
}
if (!clientSource.includes('WORKSPACE_CLI_VERSION')) {
  fail('workspaceAttachments.ts must import the contract constant');
}

const controllerSource = read('src/features/workspace/workspaceAttachmentController.ts');
if (literal.test(controllerSource)) {
  fail('workspaceAttachmentController.ts hardcodes a CLI version literal; use the contract constant');
}
if (!controllerSource.includes('WORKSPACE_CLI_VERSION')) {
  fail('workspaceAttachmentController.ts must render the contract constant');
}
if (!controllerSource.includes('switchPreview(') || !controllerSource.includes('switchApproved(')) {
  fail('workspaceAttachmentController.ts must run switch through the single-truth client preview/approved flow');
}
if (/\[\s*'switch'\s*,/u.test(controllerSource)) {
  fail('workspaceAttachmentController.ts must not hand-build the switch argument vector');
}
if (!controllerSource.includes('attachPreview(') || !controllerSource.includes('attachApproved(')) {
  fail('workspaceAttachmentController.ts must run attach through the single-truth client preview/approved flow');
}
if (/\[\s*'attach'\s*,/u.test(controllerSource)) {
  fail('workspaceAttachmentController.ts must not hand-build the attach argument vector');
}

const pkg = JSON.parse(read('package.json'));
const description = pkg.contributes?.configuration?.properties?.['kdna.workspaceCliEntry']?.description ?? '';
if (!description.includes(`@aikdna/kdna-cli ${version}`)) {
  fail(`package.json setting description must name the exact CLI ${version}`);
}

const readme = read('README.md');
if (!readme.includes(`@aikdna/kdna-cli@${version}`)) {
  fail(`README must declare the exact CLI ${version}`);
}
if (readme.includes(`@aikdna/kdna-cli@${version} or later`)) {
  fail('README must not promise a version range without a verified compatibility contract');
}

const changelog = read('CHANGELOG.md');
if (!changelog.includes(`exact CLI ${version}`)) {
  fail(`CHANGELOG must name the exact CLI ${version}`);
}

const unitTestSource = read('src/test/unit/workspaceAttachments.test.ts');
if (!unitTestSource.includes('WORKSPACE_CLI_VERSION')) {
  fail('unit test fixtures must default to the contract constant');
}
if (!unitTestSource.includes('switchAttachmentArgs(') ||
    !unitTestSource.includes('switchPreviewArgs(') ||
    !unitTestSource.includes('switchApprovedArgs(')) {
  fail('unit tests must exercise the single switch argument builders');
}
if (!unitTestSource.includes('attachBaseArgs(') ||
    !unitTestSource.includes('attachPreviewArgs(') ||
    !unitTestSource.includes('attachApprovedArgs(')) {
  fail('unit tests must exercise the single attach argument builders');
}
if (!unitTestSource.includes('--attachment-stdin') || !unitTestSource.includes('--consent-digest')) {
  fail('unit tests must exercise the attach --attachment-stdin + --consent-digest contract');
}
if (unitTestSource.includes("attachApprovedArgs('asset.kdna', 'ws', 'role'")) {
  fail('unit tests must not pass role/scope as positional argv to attachApprovedArgs');
}
for (const neighboring of ['0.36.0', '0.36.2', '0.37.0']) {
  if (!unitTestSource.includes(`'${neighboring}'`)) {
    fail(`unit tests must keep the fail-closed case for CLI ${neighboring}`);
  }
}
if (!unitTestSource.includes(`schema_version: '${schemaVersion}'`)) {
  fail(`unit test fixtures must use the exact record schema ${schemaVersion}`);
}

const contractTestSource = read('test/cli-contract.test.js');
if (!contractTestSource.includes(`'${version}'`)) {
  fail('real-CLI contract test must assert the exact contract version');
}
if (!contractTestSource.includes('switchAttachmentArgs(') ||
    !contractTestSource.includes('switchPreviewArgs(') ||
    !contractTestSource.includes('switchApprovedArgs(')) {
  fail('real-CLI contract test must consume the single switch argument builders');
}
if (!contractTestSource.includes('attachBaseArgs(') ||
    !contractTestSource.includes('attachPreviewArgs(') ||
    !contractTestSource.includes('attachApprovedArgs(')) {
  fail('real-CLI contract test must consume the single attach argument builders');
}
if (!contractTestSource.includes('--attachment-stdin') || !contractTestSource.includes('--consent-digest')) {
  fail('real-CLI contract test must exercise the attach --attachment-stdin + --consent-digest contract');
}
if (contractTestSource.includes('attachApprovedArgs(attachAsset, attachWorkspace, role')) {
  fail('real-CLI contract test must not pass role/scope as positional argv to attachApprovedArgs');
}

console.log(`Workspace CLI contract gate passed: exact CLI ${version}, record schema ${schemaVersion}.`);
