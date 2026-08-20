import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  parseWorkspaceAttachmentRecord,
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
if (Object.prototype.hasOwnProperty.call(responses, args[0])) {
  process.stdout.write(responses[args[0]]);
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
});
