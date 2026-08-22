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
  attachApprovedArgs,
  attachBaseArgs,
  attachPreviewArgs,
  parseAttachPreview,
  parseSwitchPreview,
  switchApprovedArgs,
  switchAttachmentArgs,
  switchPreviewArgs,
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

test('extension client consumes the real switch preview, approved execution, and rollback', { skip }, async () => {
  // Single truth: the vectors below are the exact builders the controller
  // uses. The UI base vector contains exactly one reviewed policy source
  // (--retain-scope) and no approval flags; the approved variant appends only
  // --yes --scope-user-approved, which the CLI records as user_explicit —
  // the Host-confirmed path used because CLI 0.36.1's interactive read and
  // cross-invocation consent digest cannot complete inside a VS Code terminal.
  const uiArgs = switchAttachmentArgs(firstId, workspaceAssetB, workspace);
  assert.deepEqual(uiArgs, [
    'switch',
    firstId,
    workspaceAssetB,
    '--cwd',
    workspace,
    '--retain-scope',
  ]);
  assert.deepEqual(switchPreviewArgs(firstId, workspaceAssetB, workspace), [
    ...uiArgs,
    '--preview',
  ]);
  assert.deepEqual(switchApprovedArgs(firstId, workspaceAssetB, workspace), [
    ...uiArgs,
    '--yes',
    '--scope-user-approved',
  ]);
  assert.equal(uiArgs.filter((argument) => argument === '--retain-scope').length, 1);
  for (const forbidden of [
    '--attachment-stdin', '--role', '--applies-to', '--does-not-apply-to',
    '--all-workspace', '--closed-world-scope', '--consent-digest',
  ]) {
    assert.equal(uiArgs.includes(forbidden), false);
    assert.equal(switchApprovedArgs(firstId, workspaceAssetB, workspace).includes(forbidden), false);
  }

  const client = new WorkspaceCliClient(CLI_ENTRY);

  // Real CLI preview through the client parser.
  const preview = await client.switchPreview(workspace, firstId, workspaceAssetB);
  assert.equal(preview.operation, 'switch');
  assert.equal(preview.attachment_id, firstId);
  assert.equal(preview.old_attachment.asset.id, 'kdna:example:content-review');
  assert.equal(preview.new_attachment.asset.id, 'kdna:example:deployment-review');
  assert.equal(preview.new_attachment.role, 'deployment-review');
  assert.equal(preview.new_attachment.scope.application, 'task_hints');
  assert.deepEqual(preview.new_attachment.scope.applies_to, ['deployment']);
  assert.match(preview.consent_digest, /^sha256:[0-9a-f]{64}$/u);

  // Approved execution (the UI executes this only after its modal
  // confirmation of the exact preview payload).
  await client.switchApproved(workspace, firstId, workspaceAssetB);
  let record = await client.status(workspace);
  const switched = record.attachments[0];
  assert.equal(switched.asset.id, 'kdna:example:deployment-review');
  assert.equal(switched.asset.digest, preview.new_attachment.asset.digest);
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
  assert.equal(switched.scope.approval_source, 'user_explicit');

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

test('extension client consumes the real attach preview and approved execution', { skip }, async () => {
  const attachWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'kdna-vscode-cli-attach-'));
  roots.push(attachWorkspace);
  const attachAsset = path.join(attachWorkspace, 'asset.kdna');
  cli(['demo', 'judgment', path.join(attachWorkspace, 'assets')], attachWorkspace);
  cli(['pack', path.join(attachWorkspace, 'assets'), attachAsset], attachWorkspace);

  const client = new WorkspaceCliClient(CLI_ENTRY);
  const role = 'secondary-review';
  const appliesTo = ['release'];
  const doesNotApplyTo = ['fiction'];

  const uiArgs = attachBaseArgs(attachAsset, attachWorkspace, role, appliesTo, doesNotApplyTo);
  assert.deepEqual(uiArgs, [
    'attach',
    attachAsset,
    '--cwd',
    attachWorkspace,
    '--role',
    role,
    '--applies-to',
    appliesTo[0],
    '--does-not-apply-to',
    doesNotApplyTo[0],
  ]);
  assert.deepEqual(attachPreviewArgs(attachAsset, attachWorkspace, role, appliesTo, doesNotApplyTo), [
    ...uiArgs,
    '--preview',
  ]);
  assert.deepEqual(attachApprovedArgs(attachAsset, attachWorkspace, role, appliesTo, doesNotApplyTo), [
    ...uiArgs,
    '--yes',
    '--scope-user-approved',
  ]);
  for (const forbidden of [
    '--attachment-stdin', '--retain-scope', '--consent-digest',
  ]) {
    assert.equal(uiArgs.includes(forbidden), false);
    assert.equal(attachApprovedArgs(attachAsset, attachWorkspace, role, appliesTo, doesNotApplyTo).includes(forbidden), false);
  }

  const before = await client.status(attachWorkspace);
  assert.equal(before, null, 'precondition: no existing attachment record');

  const preview = await client.attachPreview(attachWorkspace, attachAsset, role, appliesTo, doesNotApplyTo);
  assert.equal(preview.operation, 'attach');
  assert.equal(preview.attachment.asset.id, 'kdna:example:content-review');
  assert.equal(preview.attachment.role, role);
  assert.equal(preview.attachment.scope.application, 'task_hints');
  assert.equal(preview.attachment.scope.matching_policy, 'open_world_ask');
  assert.deepEqual(preview.attachment.scope.applies_to, appliesTo);
  assert.deepEqual(preview.attachment.scope.does_not_apply_to, doesNotApplyTo);
  assert.match(preview.consent_digest, /^sha256:[0-9a-f]{64}$/u);

  // Cancel before approval: no bytes written.
  const afterPreview = await client.status(attachWorkspace);
  assert.equal(afterPreview, null);

  await client.attachApproved(attachWorkspace, attachAsset, role, appliesTo, doesNotApplyTo);
  const record = await client.status(attachWorkspace);
  assert.equal(record.attachments.length, 1);
  const attached = record.attachments[0];
  assert.equal(attached.asset.digest, preview.attachment.asset.digest);
  assert.equal(attached.asset.id, preview.attachment.asset.id);
  assert.equal(attached.role, preview.attachment.role);
  assert.equal(attached.scope.application, preview.attachment.scope.application);
  assert.equal(attached.scope.matching_policy, preview.attachment.scope.matching_policy);
  assert.deepEqual(attached.scope.applies_to, preview.attachment.scope.applies_to);
  assert.deepEqual(attached.scope.does_not_apply_to, preview.attachment.scope.does_not_apply_to);
  assert.equal(attached.scope.approval_source, 'user_explicit');
  assert.equal(attached.state, 'enabled');
  assert.equal(attached.history.length, 0);
});

test('a missing attach asset fails closed without partial writes', { skip }, async () => {
  const attachWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'kdna-vscode-cli-attach-miss-'));
  roots.push(attachWorkspace);
  const client = new WorkspaceCliClient(CLI_ENTRY);
  const missing = path.join(attachWorkspace, 'does-not-exist.kdna');
  const before = await client.status(attachWorkspace);
  assert.equal(before, null);
  await assert.rejects(
    () => client.attachApproved(attachWorkspace, missing, 'role', ['scope'], []),
    (error) => error instanceof Error && /workspace/.test(error.message),
  );
  const after = await client.status(attachWorkspace);
  assert.equal(after, null);
});

test('a drifted or missing replacement asset fails closed without partial writes', { skip }, async () => {
  const client = new WorkspaceCliClient(CLI_ENTRY);
  const missing = path.join(workspace, 'does-not-exist.kdna');
  await assert.rejects(
    () => client.switchApproved(workspace, firstId, missing),
    (error) => error instanceof Error && /workspace/.test(error.message),
  );
  const record = await client.status(workspace);
  assert.equal(record.attachments[0].asset.id, 'kdna:example:content-review');
  assert.equal(record.attachments[0].history.length, 0);
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
