import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  parseWorkspaceAttachmentRecord,
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
    schema_version: '0.1.0',
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

function fakeCli(version = '0.36.0'): { root: string; executable: string; log: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kdna-vscode-workspace-cli-'));
  roots.push(root);
  const executable = path.join(root, 'fake-kdna');
  const log = path.join(root, 'args.jsonl');
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
if (args[0] === 'attachments') {
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
  it('accepts only the exact CLI 0.1 workspace record', () => {
    const parsed = parseWorkspaceAttachmentRecord(JSON.stringify(attachmentRecord()));
    assert.equal(parsed?.attachments[0].asset.id, 'kdna:test:review');
    assert.equal(parseWorkspaceAttachmentRecord('null'), null);
  });

  it('rejects malformed, extended, and unbounded records', () => {
    assert.throws(
      () => parseWorkspaceAttachmentRecord('{'),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_output_invalid',
    );
    const extended = { ...attachmentRecord(), global_assets: [] };
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(extended)));
    const unbounded = attachmentRecord();
    unbounded.attachments = Array.from({ length: 65 }, () => unbounded.attachments[0]);
    assert.throws(() => parseWorkspaceAttachmentRecord(JSON.stringify(unbounded)));

    const unsafeHistory = attachmentRecord();
    unsafeHistory.attachments[0].history = [{
      asset: {
        ...unsafeHistory.attachments[0].asset,
        snapshot: 'assets/not-digest-derived.kdna',
      },
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

    const safeWorkspace = fs.realpathSync(workspace);
    const invocations = fs.readFileSync(fake.log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(invocations, [
      ['attachments', '--cwd', safeWorkspace],
      ['disable', 'att_0123456789abcdef01234567', '--cwd', safeWorkspace],
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

  it('fails closed for a relative path, wrong version, or invalid identity', async () => {
    await assert.rejects(
      new WorkspaceCliClient('kdna').executable(),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_cli_not_configured',
    );
    const wrong = fakeCli('0.35.1');
    await assert.rejects(
      new WorkspaceCliClient(wrong.executable).executable(),
      (error: unknown) => error instanceof WorkspaceCliError &&
        error.code === 'workspace_cli_incompatible',
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
});
