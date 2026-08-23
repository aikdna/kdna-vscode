import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  attachApprovedArgs,
  attachBaseArgs,
  attachPreviewArgs,
  attachmentProposalBytes,
  parseAttachPreview,
  parseSwitchPreview,
  parseWorkspaceAttachmentRecord,
  switchApprovedArgs,
  switchAttachmentArgs,
  switchPreviewArgs,
  WORKSPACE_CLI_VERSION,
  WorkspaceAttachmentRecord,
  WorkspaceCliClient,
  WorkspaceCliError,
} from '../../utils/workspaceAttachments';

const roots: string[] = [];

afterEach(() => {
  delete process.env.KDNA_VSCODE_TEST_LOG;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function attachmentRecord(): WorkspaceAttachmentRecord {
  return {
    document_type: 'kdna.workspace-attachments',
    schema_version: '0.3.0',
    workspace: { root_marker: '.kdna/attachments.json' },
    attachments: [
      {
        attachment_id: 'att_0123456789abcdef01234567',
        asset: {
          id: 'kdna:test:review',
          version: '1.0.0',
          digest: `sha256:${'a'.repeat(64)}`,
          snapshot: `assets/sha256-${'a'.repeat(64)}.kdna`,
        },
        state: 'enabled',
        role: 'deployment-review',
        scope: {
          kind: 'workspace',
          application: 'task_hints',
          matching_policy: 'open_world_ask',
          authority: 'user_approved_routing_hint',
          approval_source: 'user_explicit',
          applies_to: ['deployment'],
          does_not_apply_to: ['poem'],
        },
        resolution_policy: 'load_when_clear_ask_when_ambiguous',
        approved_at: '2026-07-22T00:00:00.000Z',
        update_policy: 'explicit_switch_only',
        history: [],
      },
    ],
  };
}

function recordWithAttachmentCount(count: number): WorkspaceAttachmentRecord {
  const record = attachmentRecord();
  record.attachments = Array.from({ length: count }, (_, index) => ({
    ...record.attachments[0],
    attachment_id: `att_${String(index).padStart(24, '0')}`,
  }));
  return record;
}

function fakeCli(version = WORKSPACE_CLI_VERSION, responses?: Record<string, string>): {
  root: string;
  executable: string;
  log: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kdna-vscode-workspace-cli-'));
  roots.push(root);
  const executable = path.join(root, 'fake-kdna');
  const log = path.join(root, 'args.jsonl');
  const responseMap = responses || {};
  fs.writeFileSync(
    executable,
    `#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write(${JSON.stringify(version)} + '\\n');
  process.exit(0);
}
if (process.env.KDNA_VSCODE_TEST_LOG) {
  fs.appendFileSync(process.env.KDNA_VSCODE_TEST_LOG, JSON.stringify(args) + '\\n');
}
const responses = ${JSON.stringify(responseMap)};
let responseKey = args[0];
if (args[0] === 'switch' && args.includes('--preview')) responseKey = 'switch-preview';
if (args[0] === 'switch' && args.includes('--yes')) responseKey = 'switch-approved';
if (args[0] === 'attach' && args.includes('--preview')) responseKey = 'attach-preview';
if (args[0] === 'attach' && args.includes('--yes')) responseKey = 'attach-approved';
if (Object.prototype.hasOwnProperty.call(responses, responseKey)) {
  process.stdout.write(responses[responseKey]);
} else if (args[0] === 'attachments') {
  process.stdout.write(JSON.stringify(${JSON.stringify(attachmentRecord())}) + '\\n');
} else {
  process.stdout.write(JSON.stringify({ operation: args[0] }) + '\\n');
}
`,
    { mode: 0o700 },
  );
  return { root, executable, log };
}

describe('workspace switch argument contract (single truth for the real UI)', () => {
  it('builds exactly one --retain-scope policy source and nothing else', () => {
    const args = switchAttachmentArgs(
      'att_0123456789abcdef01234567',
      '/tmp/ws/replacement.kdna',
      '/tmp/ws',
    );
    assert.deepEqual(args, [
      'switch',
      'att_0123456789abcdef01234567',
      '/tmp/ws/replacement.kdna',
      '--cwd',
      '/tmp/ws',
      '--retain-scope',
    ]);
    assert.equal(args.filter((argument) => argument === '--retain-scope').length, 1);
  });

  it('never adds stdin policy, role/scope arguments, or automatic approval flags', () => {
    const args = switchAttachmentArgs('att_x', 'asset.kdna', 'ws');
    for (const forbidden of [
      '--attachment-stdin',
      '--role',
      '--applies-to',
      '--does-not-apply-to',
      '--all-workspace',
      '--closed-world-scope',
      '--yes',
      '--scope-user-approved',
      '--consent-digest',
      '--preview',
    ]) {
      assert.equal(args.includes(forbidden), false, `${forbidden} must not be added`);
    }
  });

  it('derives the preview and approved vectors from the same base', () => {
    const base = switchAttachmentArgs('att_x', 'asset.kdna', 'ws');
    assert.deepEqual(switchPreviewArgs('att_x', 'asset.kdna', 'ws'), [...base, '--preview']);
    assert.deepEqual(
      switchApprovedArgs('att_x', 'asset.kdna', 'ws'),
      [...base, '--yes', '--scope-user-approved'],
    );
    const approved = switchApprovedArgs('att_x', 'asset.kdna', 'ws');
    assert.equal(approved.filter((argument) => argument === '--retain-scope').length, 1);
    assert.equal(approved.includes('--attachment-stdin'), false);
    assert.equal(approved.includes('--role'), false);
    assert.equal(approved.includes('--applies-to'), false);
    assert.equal(approved.includes('--does-not-apply-to'), false);
    assert.equal(approved.includes('--consent-digest'), false);
    assert.equal(switchPreviewArgs('att_x', 'asset.kdna', 'ws').includes('--yes'), false);
  });

  it('keeps shell metacharacters as single argv elements', () => {
    const asset = '/tmp/ws/asset $(touch injected);rm.kdna';
    const args = switchAttachmentArgs('att_x', asset, '/tmp/ws/space $(evil)');
    assert.deepEqual(args.slice(0, 3), ['switch', 'att_x', asset]);
    assert.deepEqual(args.slice(3), ['--cwd', '/tmp/ws/space $(evil)', '--retain-scope']);
  });
});

describe('workspace attach argument contract (single truth for the real UI)', () => {
  it('builds the argv vector the real CLI expects with --attachment-stdin', () => {
    const args = attachBaseArgs('/tmp/ws/asset.kdna', '/tmp/ws');
    assert.deepEqual(args, [
      'attach',
      '/tmp/ws/asset.kdna',
      '--cwd',
      '/tmp/ws',
      '--attachment-stdin',
    ]);
  });

  it('never puts role/scope into argv', () => {
    const proposal = { role: 'review', applies_to: ['a', 'b'], does_not_apply_to: ['c'] };
    const bytes = attachmentProposalBytes(proposal).toString('utf8');
    for (const leaked of [proposal.role, ...proposal.applies_to, ...proposal.does_not_apply_to]) {
      assert.equal(attachBaseArgs('asset.kdna', 'ws').includes(leaked), false);
      assert.equal(attachPreviewArgs('asset.kdna', 'ws').includes(leaked), false);
      assert.equal(
        attachApprovedArgs('asset.kdna', 'ws', 'sha256:' + '0'.repeat(64)).includes(leaked),
        false,
      );
      assert.equal(bytes.includes(leaked), true, 'proposal bytes must carry the value');
    }
  });

  it('never adds retain-scope or scope-user-approved in the attach vectors', () => {
    const args = attachBaseArgs('asset.kdna', 'ws');
    for (const forbidden of [
      '--retain-scope',
      '--role',
      '--applies-to',
      '--does-not-apply-to',
      '--scope-user-approved',
    ]) {
      assert.equal(args.includes(forbidden), false, `${forbidden} must not be added`);
    }
  });

  it('derives the preview and approved vectors from the same base', () => {
    const base = attachBaseArgs('asset.kdna', 'ws');
    assert.deepEqual(attachPreviewArgs('asset.kdna', 'ws'), [...base, '--preview']);
    const digest = `sha256:${'b'.repeat(64)}`;
    assert.deepEqual(
      attachApprovedArgs('asset.kdna', 'ws', digest),
      [...base, '--yes', '--consent-digest', digest],
    );
    const approved = attachApprovedArgs('asset.kdna', 'ws', digest);
    assert.equal(approved.includes('--attachment-stdin'), true);
    assert.equal(approved.includes('--consent-digest'), true);
    assert.equal(approved.includes('--scope-user-approved'), false);
    assert.equal(attachPreviewArgs('asset.kdna', 'ws').includes('--yes'), false);
  });
});

describe('attach preview parsing boundary', () => {
  function attachPreviewEnvelope(): unknown {
    return {
      operation: 'attach',
      mode: 'preview',
      workspace_root: '.',
      confirmation_required: true,
      preview: {
        operation: 'attach',
        consent_digest: `sha256:${'b'.repeat(64)}`,
        workspace_boundary: { kind: 'exact_workspace', root: '.' },
        attachment: {
          asset: {
            id: 'kdna:test:new',
            version: '1.0.0',
            digest: `sha256:${'c'.repeat(64)}`,
            snapshot: `assets/sha256-${'c'.repeat(64)}.kdna`,
          },
          state: 'enabled',
          role: 'deployment-review',
          scope: {
            kind: 'workspace',
            application: 'task_hints',
            matching_policy: 'open_world_ask',
            authority: 'user_approved_routing_hint',
            approval_source: 'preview_confirmed',
            applies_to: ['deployment'],
            does_not_apply_to: [],
          },
          resolution_policy: 'load_when_clear_ask_when_ambiguous',
          update_policy: 'explicit_switch_only',
        },
        authorization: {
          access: 'public',
          required_before_load: false,
          load_plan_state: 'ready',
        },
        scope_contract: {
          authority: 'user_approved_routing_hint',
          asset_declared_preload_boundary: 'not_available_in_current_manifest_contract',
          runtime_boundary_remains_authoritative: true,
        },
      },
    };
  }

  it('accepts the exact real-CLI attach preview payload', () => {
    const parsed = parseAttachPreview(JSON.stringify(attachPreviewEnvelope()));
    assert.equal(parsed.operation, 'attach');
    assert.equal(parsed.attachment.asset.id, 'kdna:test:new');
    assert.equal(parsed.attachment.role, 'deployment-review');
    assert.equal(parsed.attachment.scope.application, 'task_hints');
    assert.equal(parsed.authorization.load_plan_state, 'ready');
    assert.equal(parsed.scope_contract.runtime_boundary_remains_authoritative, true);
  });

  it('rejects malformed, extended, and inconsistent attach previews', () => {
    assert.throws(() => parseAttachPreview('{'));
    const extended = attachPreviewEnvelope();
    (extended as Record<string, unknown>).extra = true;
    assert.throws(() => parseAttachPreview(JSON.stringify(extended)));
    const extendedInner = attachPreviewEnvelope() as Record<string, unknown>;
    (extendedInner.preview as Record<string, unknown>).extra = true;
    assert.throws(() => parseAttachPreview(JSON.stringify(extendedInner)));
    const badDigest = attachPreviewEnvelope();
    (badDigest as Record<string, unknown>).preview = {
      ...(badDigest as Record<string, unknown>).preview as object,
      consent_digest: `sha256:${'z'.repeat(64)}`,
    };
    assert.throws(() => parseAttachPreview(JSON.stringify(badDigest)));
    const inconsistent = attachPreviewEnvelope();
    ((inconsistent as Record<string, unknown>).preview as Record<string, unknown>)
      .attachment = { state: 'enabled' };
    assert.throws(() => parseAttachPreview(JSON.stringify(inconsistent)));
    const missingConfirmation = attachPreviewEnvelope();
    (missingConfirmation as Record<string, unknown>).confirmation_required = false;
    assert.throws(() => parseAttachPreview(JSON.stringify(missingConfirmation)));
  });
});

describe('switch preview parsing boundary', () => {
  function switchPreviewEnvelope(): unknown {
    return {
      operation: 'switch',
      mode: 'preview',
      workspace_root: '.',
      confirmation_required: true,
      preview: {
        operation: 'switch',
        consent_digest: `sha256:${'b'.repeat(64)}`,
        workspace_boundary: { kind: 'exact_workspace', root: '.' },
        attachment_id: 'att_0123456789abcdef01234567',
        old_attachment: {
          asset: {
            id: 'kdna:test:old',
            version: '1.0.0',
            digest: `sha256:${'a'.repeat(64)}`,
            snapshot: `assets/sha256-${'a'.repeat(64)}.kdna`,
          },
          role: 'deployment-review',
          scope: {
            kind: 'workspace',
            application: 'task_hints',
            matching_policy: 'open_world_ask',
            authority: 'user_approved_routing_hint',
            approval_source: 'user_explicit',
            applies_to: ['deployment'],
            does_not_apply_to: ['poem'],
          },
          resolution_policy: 'load_when_clear_ask_when_ambiguous',
          approved_at: '2026-07-22T00:00:00.000Z',
          update_policy: 'explicit_switch_only',
        },
        new_attachment: {
          asset: {
            id: 'kdna:test:new',
            version: '1.0.0',
            digest: `sha256:${'c'.repeat(64)}`,
            snapshot: `assets/sha256-${'c'.repeat(64)}.kdna`,
          },
          state: 'enabled',
          role: 'deployment-review',
          scope: {
            kind: 'workspace',
            application: 'task_hints',
            matching_policy: 'open_world_ask',
            authority: 'user_approved_routing_hint',
            approval_source: 'preview_confirmed',
            applies_to: ['deployment'],
            does_not_apply_to: ['poem'],
          },
          resolution_policy: 'load_when_clear_ask_when_ambiguous',
          approved_at: '2026-07-22T00:00:01.000Z',
          update_policy: 'explicit_switch_only',
        },
        authorization: {
          old: { access: 'public', required_before_load: false, load_plan_state: 'ready' },
          new: { access: 'public', required_before_load: false, load_plan_state: 'ready' },
        },
        scope_contract: {
          inherited_without_review: false,
          asset_declared_preload_boundary: 'not_available_in_current_manifest_contract',
          runtime_boundary_remains_authoritative: true,
        },
      },
    };
  }

  it('accepts the exact real-CLI switch preview payload', () => {
    const parsed = parseSwitchPreview(JSON.stringify(switchPreviewEnvelope()));
    assert.equal(parsed.operation, 'switch');
    assert.equal(parsed.attachment_id, 'att_0123456789abcdef01234567');
    assert.equal(parsed.new_attachment.asset.id, 'kdna:test:new');
    assert.equal(parsed.old_attachment.asset.id, 'kdna:test:old');
    assert.equal(parsed.new_attachment.role, 'deployment-review');
    assert.equal(parsed.authorization.new.load_plan_state, 'ready');
    assert.equal(parsed.scope_contract.runtime_boundary_remains_authoritative, true);
  });

  it('rejects malformed, extended, and inconsistent previews', () => {
    assert.throws(() => parseSwitchPreview('{'));
    const extended = switchPreviewEnvelope();
    (extended as Record<string, unknown>).extra = true;
    assert.throws(() => parseSwitchPreview(JSON.stringify(extended)));
    const extendedInner = switchPreviewEnvelope() as Record<string, unknown>;
    (extendedInner.preview as Record<string, unknown>).extra = true;
    assert.throws(() => parseSwitchPreview(JSON.stringify(extendedInner)));
    const badDigest = switchPreviewEnvelope();
    (badDigest as Record<string, unknown>).preview = {
      ...(badDigest as Record<string, unknown>).preview as object,
      consent_digest: `sha256:${'z'.repeat(64)}`,
    };
    assert.throws(() => parseSwitchPreview(JSON.stringify(badDigest)));
    const inconsistent = switchPreviewEnvelope();
    ((inconsistent as Record<string, unknown>).preview as Record<string, unknown>)
      .new_attachment = { state: 'enabled' };
    assert.throws(() => parseSwitchPreview(JSON.stringify(inconsistent)));
    const missingConfirmation = switchPreviewEnvelope();
    (missingConfirmation as Record<string, unknown>).confirmation_required = false;
    assert.throws(() => parseSwitchPreview(JSON.stringify(missingConfirmation)));
  });
});

describe('workspace attachment record boundary', () => {
  it('accepts the exact CLI record and carries the full display contract', () => {
    const parsed = parseWorkspaceAttachmentRecord(JSON.stringify(attachmentRecord()));
    const attachment = parsed?.attachments[0];
    assert.equal(parsed?.schema_version, '0.3.0');
    assert.equal(attachment?.asset.id, 'kdna:test:review');
    assert.equal(attachment?.asset.version, '1.0.0');
    assert.equal(attachment?.asset.digest, `sha256:${'a'.repeat(64)}`);
    assert.equal(attachment?.role, 'deployment-review');
    assert.equal(attachment?.state, 'enabled');
    assert.equal(attachment?.scope.kind, 'workspace');
    assert.equal(attachment?.scope.application, 'task_hints');
    assert.equal(attachment?.scope.matching_policy, 'open_world_ask');
    assert.equal(attachment?.scope.authority, 'user_approved_routing_hint');
    assert.equal(attachment?.scope.approval_source, 'user_explicit');
    assert.deepEqual(attachment?.scope.applies_to, ['deployment']);
    assert.deepEqual(attachment?.scope.does_not_apply_to, ['poem']);
    assert.equal(attachment?.resolution_policy, 'load_when_clear_ask_when_ambiguous');
    assert.equal(attachment?.update_policy, 'explicit_switch_only');
    assert.equal(parseWorkspaceAttachmentRecord('null'), null);
  });

  it('accepts the exact CLI closed-world and all-workspace scope forms', () => {
    const closedWorld = attachmentRecord();
    closedWorld.attachments[0].scope = {
      kind: 'workspace',
      application: 'task_hints',
      matching_policy: 'closed_world_skip',
      authority: 'user_approved_routing_hint',
      approval_source: 'preview_confirmed',
      applies_to: ['deployment'],
      does_not_apply_to: [],
    };
    assert.equal(
      parseWorkspaceAttachmentRecord(JSON.stringify(closedWorld))?.attachments[0]
        .scope.matching_policy,
      'closed_world_skip',
    );
    const allWorkspace = attachmentRecord();
    allWorkspace.attachments[0].scope = {
      kind: 'workspace',
      application: 'all_workspace',
      matching_policy: 'all_workspace',
      authority: 'user_approved_routing_hint',
      approval_source: 'user_explicit',
      applies_to: [],
      does_not_apply_to: [],
    };
    assert.equal(
      parseWorkspaceAttachmentRecord(JSON.stringify(allWorkspace))?.attachments[0]
        .scope.application,
      'all_workspace',
    );
  });

  it('rejects malformed, legacy-schema, extended, and unbounded records', () => {
    assert.throws(
      () => parseWorkspaceAttachmentRecord('{'),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_output_invalid',
    );
    const legacy = { ...attachmentRecord(), schema_version: '0.1.0' };
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(legacy)));
    const extended = { ...attachmentRecord(), global_assets: [] };
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(extended)));
    assert.throws(() => parseWorkspaceAttachmentRecord(
      JSON.stringify(recordWithAttachmentCount(1025)),
    ));

    const duplicateIds = recordWithAttachmentCount(2);
    duplicateIds.attachments[1].attachment_id = duplicateIds.attachments[0].attachment_id;
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(duplicateIds)));

    const impossibleScope = attachmentRecord();
    impossibleScope.attachments[0].scope = {
      ...impossibleScope.attachments[0].scope,
      matching_policy: 'all_workspace',
    };
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(impossibleScope)));

    const emptyTaskScope = attachmentRecord();
    emptyTaskScope.attachments[0].scope.applies_to = [];
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(emptyTaskScope)));

    const unsafeHistory = attachmentRecord();
    unsafeHistory.attachments[0].history = [{
      asset: {
        ...unsafeHistory.attachments[0].asset,
        snapshot: 'assets/not-digest-derived.kdna',
      },
      role: unsafeHistory.attachments[0].role,
      scope: unsafeHistory.attachments[0].scope,
      resolution_policy: unsafeHistory.attachments[0].resolution_policy,
      approved_at: unsafeHistory.attachments[0].approved_at,
      update_policy: unsafeHistory.attachments[0].update_policy,
      replaced_at: '2026-07-22T00:00:00.000Z',
    }];
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(unsafeHistory)));
  });
});

describe('workspace CLI process boundary', () => {
  it('uses the exact configured executable and passes arguments without a shell', async () => {
    const fake = fakeCli();
    const workspace = path.join(fake.root, 'project $(touch injected)');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.kdna', 'attachments.json'), '{}');
    process.env.KDNA_VSCODE_TEST_LOG = fake.log;
    const client = new WorkspaceCliClient(fake.executable);

    const status = await client.status(workspace);
    assert.equal(status?.attachments[0].attachment_id, 'att_0123456789abcdef01234567');
    await client.setState(
      workspace,
      'att_0123456789abcdef01234567',
      'disabled',
    );
    await client.setState(
      workspace,
      'att_0123456789abcdef01234567',
      'enabled',
    );
    await client.rollback(workspace, 'att_0123456789abcdef01234567');
    await client.remove(workspace, 'att_0123456789abcdef01234567');

    const safeWorkspace = fs.realpathSync(workspace);
    const invocations = fs.readFileSync(fake.log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(invocations, [
      ['attachments', '--cwd', safeWorkspace],
      ['disable', 'att_0123456789abcdef01234567', '--cwd', safeWorkspace],
      ['enable', 'att_0123456789abcdef01234567', '--cwd', safeWorkspace],
      ['rollback', 'att_0123456789abcdef01234567', '--cwd', safeWorkspace],
      ['remove', 'att_0123456789abcdef01234567', '--cwd', safeWorkspace],
    ]);
    assert.equal(fs.existsSync(path.join(fake.root, 'injected')), false);
  });

  it('does not inherit a parent record or invoke the CLI for an unattached root', async () => {
    const fake = fakeCli();
    const child = path.join(fake.root, 'child');
    fs.mkdirSync(path.join(fake.root, '.kdna'));
    fs.writeFileSync(path.join(fake.root, '.kdna', 'attachments.json'), '{}');
    fs.mkdirSync(child);
    process.env.KDNA_VSCODE_TEST_LOG = fake.log;

    assert.equal(await new WorkspaceCliClient(fake.executable).status(child), null);
    assert.equal(fs.existsSync(fake.log), false);
  });

  it('rejects a symlinked workspace record without invoking the CLI', async () => {
    const fake = fakeCli();
    const workspace = path.join(fake.root, 'symlinked-record');
    const externalRecord = path.join(fake.root, 'external.json');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(externalRecord, '{}');
    fs.symlinkSync(externalRecord, path.join(workspace, '.kdna', 'attachments.json'));
    process.env.KDNA_VSCODE_TEST_LOG = fake.log;

    await assert.rejects(
      new WorkspaceCliClient(fake.executable).status(workspace),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_record_unavailable',
    );
    assert.equal(fs.existsSync(fake.log), false);
  });

  it('fails closed for a relative path, missing entry, or invalid identity', async () => {
    await assert.rejects(
      new WorkspaceCliClient('kdna').executable(),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_cli_not_configured',
    );
    await assert.rejects(
      new WorkspaceCliClient(path.join(os.tmpdir(), 'definitely-missing-kdna-cli')).executable(),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_cli_unavailable',
    );
    const exact = fakeCli();
    fs.mkdirSync(path.join(exact.root, '.kdna'));
    fs.writeFileSync(path.join(exact.root, '.kdna', 'attachments.json'), '{}');
    await assert.rejects(
      new WorkspaceCliClient(exact.executable).remove(exact.root, 'not-an-attachment'),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_attachment_invalid',
    );
  });

  it('fails closed for every non-exact CLI version', async () => {
    for (const wrong of ['0.36.0', '0.36.2', '0.37.0', '0.35.1']) {
      const fake = fakeCli(wrong);
      await assert.rejects(
        new WorkspaceCliClient(fake.executable).executable(),
        (error: unknown) => error instanceof WorkspaceCliError &&
          error.code === 'workspace_cli_incompatible',
        `CLI ${wrong} must fail closed`,
      );
    }
  });

  it('fails closed for malformed version output', async () => {
    for (const malformed of [
      '0.36.1-beta',
      'v0.36.1',
      '0.36.1\n0.36.1',
      'garbage',
      '',
    ]) {
      const fake = fakeCli(malformed);
      await assert.rejects(
        new WorkspaceCliClient(fake.executable).executable(),
        (error: unknown) => error instanceof WorkspaceCliError &&
          error.code === 'workspace_cli_incompatible',
        `version output ${JSON.stringify(malformed)} must fail closed`,
      );
    }
  });

  it('fails closed when the CLI returns an invalid attachment record', async () => {
    const broken = fakeCli(WORKSPACE_CLI_VERSION, { attachments: '{not-json' });
    const workspace = path.join(broken.root, 'ws');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.kdna', 'attachments.json'), '{}');
    await assert.rejects(
      new WorkspaceCliClient(broken.executable).status(workspace),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_output_invalid',
    );

    const legacy = fakeCli(WORKSPACE_CLI_VERSION, {
      attachments: JSON.stringify({ ...attachmentRecord(), schema_version: '0.1.0' }),
    });
    const legacyWorkspace = path.join(legacy.root, 'ws');
    fs.mkdirSync(path.join(legacyWorkspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(legacyWorkspace, '.kdna', 'attachments.json'), '{}');
    await assert.rejects(
      new WorkspaceCliClient(legacy.executable).status(legacyWorkspace),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_output_invalid',
    );
  });

  it('consumes the switch preview and approved vectors through the client', async () => {
    const previewEnvelope = JSON.stringify({
      operation: 'switch',
      mode: 'preview',
      workspace_root: '.',
      confirmation_required: true,
      preview: {
        operation: 'switch',
        consent_digest: `sha256:${'b'.repeat(64)}`,
        workspace_boundary: { kind: 'exact_workspace', root: '.' },
        attachment_id: 'att_0123456789abcdef01234567',
        old_attachment: {
          asset: {
            id: 'kdna:test:old',
            version: '1.0.0',
            digest: `sha256:${'a'.repeat(64)}`,
            snapshot: `assets/sha256-${'a'.repeat(64)}.kdna`,
          },
          role: 'deployment-review',
          scope: {
            kind: 'workspace',
            application: 'task_hints',
            matching_policy: 'open_world_ask',
            authority: 'user_approved_routing_hint',
            approval_source: 'user_explicit',
            applies_to: ['deployment'],
            does_not_apply_to: [],
          },
          resolution_policy: 'load_when_clear_ask_when_ambiguous',
          approved_at: '2026-07-22T00:00:00.000Z',
          update_policy: 'explicit_switch_only',
        },
        new_attachment: {
          asset: {
            id: 'kdna:test:new',
            version: '1.0.0',
            digest: `sha256:${'c'.repeat(64)}`,
            snapshot: `assets/sha256-${'c'.repeat(64)}.kdna`,
          },
          state: 'enabled',
          role: 'deployment-review',
          scope: {
            kind: 'workspace',
            application: 'task_hints',
            matching_policy: 'open_world_ask',
            authority: 'user_approved_routing_hint',
            approval_source: 'preview_confirmed',
            applies_to: ['deployment'],
            does_not_apply_to: [],
          },
          resolution_policy: 'load_when_clear_ask_when_ambiguous',
          approved_at: '2026-07-22T00:00:01.000Z',
          update_policy: 'explicit_switch_only',
        },
        authorization: {
          old: { access: 'public', required_before_load: false, load_plan_state: 'ready' },
          new: { access: 'public', required_before_load: false, load_plan_state: 'ready' },
        },
        scope_contract: {
          inherited_without_review: false,
          asset_declared_preload_boundary: 'not_available_in_current_manifest_contract',
          runtime_boundary_remains_authoritative: true,
        },
      },
    });
    const fake = fakeCli(WORKSPACE_CLI_VERSION, {
      'switch-preview': previewEnvelope,
      'switch-approved': JSON.stringify({ operation: 'switch', switched: true }),
    });
    const workspace = path.join(fake.root, 'ws');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.kdna', 'attachments.json'), '{}');
    process.env.KDNA_VSCODE_TEST_LOG = fake.log;
    const client = new WorkspaceCliClient(fake.executable);

    const preview = await client.switchPreview(
      workspace,
      'att_0123456789abcdef01234567',
      '/tmp/replacement.kdna',
    );
    assert.equal(preview.new_attachment.asset.id, 'kdna:test:new');
    const approved = await client.switchApproved(
      workspace,
      'att_0123456789abcdef01234567',
      '/tmp/replacement.kdna',
    );
    assert.deepEqual(approved, { operation: 'switch', switched: true });

    const safeWorkspace = fs.realpathSync(workspace);
    const invocations = fs.readFileSync(fake.log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(invocations, [
      ['switch', 'att_0123456789abcdef01234567', '/tmp/replacement.kdna', '--cwd', safeWorkspace, '--retain-scope', '--preview'],
      ['switch', 'att_0123456789abcdef01234567', '/tmp/replacement.kdna', '--cwd', safeWorkspace, '--retain-scope', '--yes', '--scope-user-approved'],
    ]);
  });

  it('fails closed when the CLI returns an invalid switch preview', async () => {
    const broken = fakeCli(WORKSPACE_CLI_VERSION, { 'switch-preview': '{not-json' });
    const workspace = path.join(broken.root, 'ws');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.kdna', 'attachments.json'), '{}');
    await assert.rejects(
      new WorkspaceCliClient(broken.executable).switchPreview(
        workspace,
        'att_0123456789abcdef01234567',
        '/tmp/replacement.kdna',
      ),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_output_invalid',
    );
  });

  it('consumes the attach preview and approved vectors through the client', async () => {
    const previewEnvelope = JSON.stringify({
      operation: 'attach',
      mode: 'preview',
      workspace_root: '.',
      confirmation_required: true,
      preview: {
        operation: 'attach',
        consent_digest: `sha256:${'b'.repeat(64)}`,
        workspace_boundary: { kind: 'exact_workspace', root: '.' },
        attachment: {
          asset: {
            id: 'kdna:test:new',
            version: '1.0.0',
            digest: `sha256:${'c'.repeat(64)}`,
            snapshot: `assets/sha256-${'c'.repeat(64)}.kdna`,
          },
          state: 'enabled',
          role: 'deployment-review',
          scope: {
            kind: 'workspace',
            application: 'task_hints',
            matching_policy: 'open_world_ask',
            authority: 'user_approved_routing_hint',
            approval_source: 'preview_confirmed',
            applies_to: ['deployment'],
            does_not_apply_to: [],
          },
          resolution_policy: 'load_when_clear_ask_when_ambiguous',
          update_policy: 'explicit_switch_only',
        },
        authorization: {
          access: 'public',
          required_before_load: false,
          load_plan_state: 'ready',
        },
        scope_contract: {
          authority: 'user_approved_routing_hint',
          asset_declared_preload_boundary: 'not_available_in_current_manifest_contract',
          runtime_boundary_remains_authoritative: true,
        },
      },
    });
    const approvedAttachment = {
      attachment_id: 'att_0123456789abcdef01234568',
      asset: {
        id: 'kdna:test:new',
        version: '1.0.0',
        digest: `sha256:${'c'.repeat(64)}`,
        snapshot: `assets/sha256-${'c'.repeat(64)}.kdna`,
      },
      state: 'enabled',
      role: 'deployment-review',
      scope: {
        kind: 'workspace',
        application: 'task_hints',
        matching_policy: 'open_world_ask',
        authority: 'user_approved_routing_hint',
        approval_source: 'preview_confirmed',
        applies_to: ['deployment'],
        does_not_apply_to: [],
      },
      resolution_policy: 'load_when_clear_ask_when_ambiguous',
      approved_at: '2026-08-23T00:00:00.000Z',
      update_policy: 'explicit_switch_only',
      history: [],
    };
    const fake = fakeCli(WORKSPACE_CLI_VERSION, {
      'attach-preview': previewEnvelope,
      'attach-approved': JSON.stringify({ operation: 'attach', workspace_root: '.', attachment: approvedAttachment }),
    });
    const workspace = path.join(fake.root, 'ws');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.kdna', 'attachments.json'), '{}');
    process.env.KDNA_VSCODE_TEST_LOG = fake.log;
    const client = new WorkspaceCliClient(fake.executable);

    const proposal = { role: 'deployment-review', applies_to: ['deployment'], does_not_apply_to: [] };
    const preview = await client.attachPreview(workspace, '/tmp/new.kdna', proposal);
    assert.equal(preview.attachment.asset.id, 'kdna:test:new');
    const approved = await client.attachApproved(workspace, '/tmp/new.kdna', proposal, preview.consent_digest);
    assert.equal(approved.attachment_id, approvedAttachment.attachment_id);
    assert.equal(approved.scope.approval_source, 'preview_confirmed');

    const safeWorkspace = fs.realpathSync(workspace);
    const invocations = fs.readFileSync(fake.log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(invocations, [
      ['attach', '/tmp/new.kdna', '--cwd', safeWorkspace, '--attachment-stdin', '--preview'],
      ['attach', '/tmp/new.kdna', '--cwd', safeWorkspace, '--attachment-stdin', '--yes', '--consent-digest', preview.consent_digest],
    ]);
    for (const invocation of invocations) {
      assert.equal(invocation.includes('deployment-review'), false, 'role must not leak to argv');
      assert.equal(invocation.includes('deployment'), false, 'scope terms must not leak to argv');
    }
  });

  it('fails closed when the CLI returns an invalid attach preview', async () => {
    const broken = fakeCli(WORKSPACE_CLI_VERSION, { 'attach-preview': '{not-json' });
    const workspace = path.join(broken.root, 'ws');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.kdna', 'attachments.json'), '{}');
    await assert.rejects(
      new WorkspaceCliClient(broken.executable).attachPreview(
        workspace,
        '/tmp/new.kdna',
        { role: 'deployment-review', applies_to: ['deployment'], does_not_apply_to: [] },
      ),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_output_invalid',
    );
  });

  it('fails closed when the CLI returns an invalid attach result', async () => {
    const broken = fakeCli(WORKSPACE_CLI_VERSION, {
      'attach-preview': JSON.stringify({
        operation: 'attach',
        mode: 'preview',
        workspace_root: '.',
        confirmation_required: true,
        preview: {
          operation: 'attach',
          consent_digest: `sha256:${'b'.repeat(64)}`,
          workspace_boundary: { kind: 'exact_workspace', root: '.' },
          attachment: {
            asset: {
              id: 'kdna:test:new',
              version: '1.0.0',
              digest: `sha256:${'c'.repeat(64)}`,
              snapshot: `assets/sha256-${'c'.repeat(64)}.kdna`,
            },
            state: 'enabled',
            role: 'deployment-review',
            scope: {
              kind: 'workspace',
              application: 'task_hints',
              matching_policy: 'open_world_ask',
              authority: 'user_approved_routing_hint',
              approval_source: 'preview_confirmed',
              applies_to: ['deployment'],
              does_not_apply_to: [],
            },
            resolution_policy: 'load_when_clear_ask_when_ambiguous',
            update_policy: 'explicit_switch_only',
          },
          authorization: {
            access: 'public',
            required_before_load: false,
            load_plan_state: 'ready',
          },
          scope_contract: {
            authority: 'user_approved_routing_hint',
            asset_declared_preload_boundary: 'not_available_in_current_manifest_contract',
            runtime_boundary_remains_authoritative: true,
          },
        },
      }),
      'attach-approved': '{not-json',
    });
    const workspace = path.join(broken.root, 'ws');
    fs.mkdirSync(path.join(workspace, '.kdna'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.kdna', 'attachments.json'), '{}');
    await assert.rejects(
      new WorkspaceCliClient(broken.executable).attachApproved(
        workspace,
        '/tmp/new.kdna',
        { role: 'deployment-review', applies_to: ['deployment'], does_not_apply_to: [] },
        `sha256:${'b'.repeat(64)}`,
      ),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_output_invalid',
    );
  });

  it('rejects an oversized attachment proposal', () => {
    assert.throws(
      () => attachmentProposalBytes({
        role: 'x',
        applies_to: ['a'.repeat(100_000)],
        does_not_apply_to: [],
      }),
      (error: unknown) => error instanceof WorkspaceCliError,
    );
  });
});
