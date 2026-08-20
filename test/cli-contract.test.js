'use strict';

/**
 * Real-CLI contract test (25.7.8): the extension client must consume the
 * exact pinned kdna-cli 0.36.1 output, not a mock.
 *
 * Requires KDNA_CLI_ENTRY (absolute path to the pinned CLI's src/cli.js).
 * The dedicated CI job checks out aikdna/kdna-cli at the pinned commit and
 * sets the variable. Local runs without the variable skip with an explicit
 * reason; the CI job never skips.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const {
  switchAttachmentArgs,
  WORKSPACE_CLI_VERSION,
  WorkspaceCliClient,
} = require('../out/utils/workspaceAttachments.js');

const CLI_ENTRY = process.env.KDNA_CLI_ENTRY;
const skip = !CLI_ENTRY
  ? 'KDNA_CLI_ENTRY is not set; run the dedicated cli-contract CI job or point KDNA_CLI_ENTRY at the pinned CLI src/cli.js.'
  : false;

const roots = [];

function cli(args, cwd) {
  return execFileSync(process.execPath, [CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
}

function attachmentIds(workspace) {
  const record = JSON.parse(cli(['attachments', '--cwd', workspace], workspace));
  return record.attachments.map((attachment) => attachment.attachment_id);
}

let workspace;
let workspaceAssetA;
let workspaceAssetB;
let firstId;
let firstDigest;

before(() => {
  if (skip) return;
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'kdna-vscode-cli-contract-'));
  roots.push(workspace);
  workspaceAssetA = path.join(workspace, 'asset-a.kdna');
  workspaceAssetB = path.join(workspace, 'asset-b.kdna');
  cli(['demo', 'judgment', path.join(workspace, 'assets-a')], workspace);
  cli(['pack', path.join(workspace, 'assets-a'), workspaceAssetA], workspace);
  cli(['demo', 'minimal', path.join(workspace, 'assets-b')], workspace);
  cli(['pack', path.join(workspace, 'assets-b'), workspaceAssetB], workspace);
  cli([
    'attach',
    workspaceAssetA,
    '--cwd',
    workspace,
    '--role',
    'deployment-review',
    '--applies-to',
    'deployment',
    '--does-not-apply-to',
    'poem',
    '--yes',
    '--scope-user-approved',
  ], workspace);
  [firstId] = attachmentIds(workspace);
  firstDigest = JSON.parse(cli(['attachments', '--cwd', workspace], workspace))
    .attachments[0].asset.digest;
});

after(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('contract constant and the real CLI agree on the exact version', { skip }, () => {
  assert.equal(WORKSPACE_CLI_VERSION, '0.36.1');
  assert.equal(cli(['--version'], workspace).trim(), WORKSPACE_CLI_VERSION);
});

test('extension client resolves the real CLI through its exact-version gate', { skip }, async () => {
  const client = new WorkspaceCliClient(CLI_ENTRY);
  const executable = await client.executable();
  assert.equal(fs.realpathSync(executable), fs.realpathSync(CLI_ENTRY));
});

test('extension client consumes the real CLI status record', { skip }, async () => {
  const client = new WorkspaceCliClient(CLI_ENTRY);
  const record = await client.status(workspace);
  assert.ok(record, 'status must return a record');
  assert.equal(record.schema_version, '0.3.0');
  assert.equal(record.workspace.root_marker, '.kdna/attachments.json');
  assert.equal(record.attachments.length, 1);
  const attachment = record.attachments[0];
  assert.equal(attachment.attachment_id, firstId);
  assert.equal(attachment.state, 'enabled');
  assert.equal(attachment.role, 'deployment-review');
  assert.equal(attachment.asset.id, 'kdna:example:content-review');
  assert.match(attachment.asset.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(attachment.asset.version, /^[0-9]+\.[0-9]+\.[0-9]+$/u);
  assert.equal(attachment.scope.kind, 'workspace');
  assert.equal(attachment.scope.application, 'task_hints');
  assert.equal(attachment.scope.matching_policy, 'open_world_ask');
  assert.equal(attachment.scope.authority, 'user_approved_routing_hint');
  assert.equal(attachment.scope.approval_source, 'user_explicit');
  assert.deepEqual(attachment.scope.applies_to, ['deployment']);
  assert.deepEqual(attachment.scope.does_not_apply_to, ['poem']);
});

test('extension client drives the real disable/enable lifecycle', { skip }, async () => {
  const client = new WorkspaceCliClient(CLI_ENTRY);
  await client.setState(workspace, firstId, 'disabled');
  let record = await client.status(workspace);
  assert.equal(record.attachments.find((entry) => entry.attachment_id === firstId).state, 'disabled');
  await client.setState(workspace, firstId, 'enabled');
  record = await client.status(workspace);
  assert.equal(record.attachments.find((entry) => entry.attachment_id === firstId).state, 'enabled');
});

test('extension client consumes the real switch history and rollback', { skip }, async () => {
  // The exact argument vector the real UI launches. It is the same single
  // truth the controller uses; this test does not hand-build a divergent
  // vector. It contains exactly one reviewed policy source (--retain-scope)
  // and no automatic approval flags: the CLI keeps interactive confirmation.
  const uiArgs = switchAttachmentArgs(firstId, workspaceAssetB, workspace);
  assert.deepEqual(uiArgs, [
    'switch',
    firstId,
    workspaceAssetB,
    '--cwd',
    workspace,
    '--retain-scope',
  ]);
  assert.equal(uiArgs.filter((argument) => argument === '--retain-scope').length, 1);
  for (const forbidden of [
    '--attachment-stdin', '--role', '--applies-to', '--does-not-apply-to',
    '--all-workspace', '--closed-world-scope',
    '--yes', '--scope-user-approved', '--consent-digest', '--preview',
  ]) {
    assert.equal(uiArgs.includes(forbidden), false);
  }

  // Test-only automated confirmation appended to the UI base vector so the
  // non-interactive CI run can pass the CLI's human approval gate; the UI
  // itself never appends these flags.
  cli([...uiArgs, '--yes', '--scope-user-approved'], workspace);

  const client = new WorkspaceCliClient(CLI_ENTRY);
  let record = await client.status(workspace);
  const switched = record.attachments[0];
  assert.equal(switched.asset.id, 'kdna:example:deployment-review');
  assert.notEqual(switched.asset.digest, firstDigest);
  assert.equal(switched.history.length, 1);
  assert.equal(switched.history[0].asset.id, 'kdna:example:content-review');
  assert.equal(switched.history[0].role, 'deployment-review');
  assert.equal(switched.history[0].scope.application, 'task_hints');
  assert.deepEqual(switched.history[0].scope.applies_to, ['deployment']);
  assert.deepEqual(switched.history[0].scope.does_not_apply_to, ['poem']);
  assert.equal(
    switched.history[0].resolution_policy,
    'load_when_clear_ask_when_ambiguous',
  );
  assert.equal(switched.history[0].update_policy, 'explicit_switch_only');
  assert.match(switched.history[0].replaced_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.equal(switched.role, 'deployment-review');
  assert.equal(switched.scope.application, 'task_hints');
  assert.deepEqual(switched.scope.applies_to, ['deployment']);

  await client.rollback(workspace, firstId);
  record = await client.status(workspace);
  const rolledBack = record.attachments[0];
  assert.equal(rolledBack.asset.id, 'kdna:example:content-review');
  assert.equal(rolledBack.asset.digest, firstDigest);
  assert.equal(rolledBack.role, 'deployment-review');
  assert.equal(rolledBack.state, 'enabled');
  assert.deepEqual(rolledBack.scope.applies_to, ['deployment']);
  assert.equal(rolledBack.history.length, 0);
});

test('the legacy policy-less switch vector fails closed with the real CLI', { skip }, () => {
  assert.throws(
    () => cli(['switch', firstId, workspaceAssetA, '--cwd', workspace], workspace),
    (error) => error.status === 2,
    'the pre-fix UI vector must exit 2 and never reach confirmation',
  );
});

test('multiple policy sources fail closed with the real CLI', { skip }, () => {
  const args = switchAttachmentArgs(firstId, workspaceAssetA, workspace);
  assert.throws(
    () => cli([...args, '--role', 'extra-policy'], workspace),
    (error) => error.status === 2,
    'more than one reviewed policy source must exit 2',
  );
});

test('extension client removes the real relation', { skip }, async () => {
  const client = new WorkspaceCliClient(CLI_ENTRY);
  await client.remove(workspace, firstId);
  const record = await client.status(workspace);
  assert.equal(record.attachments.length, 0);
});
