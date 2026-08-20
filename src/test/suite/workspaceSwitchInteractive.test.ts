/**
 * Real Extension-Host smoke for the Switch/Rollback lifecycle against the
 * pinned CLI.
 *
 * Runs inside a real VS Code Extension Host: the client flow the controller
 * uses (switchPreview -> switchApproved -> rollback) is exercised against the
 * real CLI 0.36.1 on a real temporary workspace, and the reason the UI uses
 * the Host-confirmed path instead of the CLI's terminal prompt is pinned with
 * a darwin-only regression observation.
 *
 * Requires KDNA_CLI_ENTRY (absolute path to the pinned CLI src/cli.js).
 * Skips with an explicit reason when the variable is absent.
 */

import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  switchAttachmentArgs,
  WorkspaceCliClient,
} from '../../utils/workspaceAttachments';

const CLI_ENTRY = process.env.KDNA_CLI_ENTRY;

function cli(args: string[], cwd: string): string {
  if (!CLI_ENTRY) throw new Error('KDNA_CLI_ENTRY is required for this suite');
  return execFileSync(process.execPath, [CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function closedTerminal(terminal: vscode.Terminal): Promise<void> {
  return new Promise((resolve) => {
    const listener = vscode.window.onDidCloseTerminal((closed) => {
      if (closed === terminal) {
        listener.dispose();
        resolve();
      }
    });
    setTimeout(() => {
      listener.dispose();
      resolve();
    }, 60_000);
  });
}

suite('Workspace Switch/Rollback Extension-Host smoke', () => {
  let workspace: string;

  suiteSetup(function () {
    if (!CLI_ENTRY) {
      this.skip();
      return;
    }
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'kdna-vscode-switch-host-'));
    cli(['demo', 'judgment', path.join(workspace, 'assets-a')], workspace);
    cli(['pack', path.join(workspace, 'assets-a'), path.join(workspace, 'a.kdna')], workspace);
    cli(['demo', 'minimal', path.join(workspace, 'assets-b')], workspace);
    cli(['pack', path.join(workspace, 'assets-b'), path.join(workspace, 'b.kdna')], workspace);
    cli([
      'attach',
      path.join(workspace, 'a.kdna'),
      '--cwd',
      workspace,
      '--role',
      'smoke-role',
      '--applies-to',
      'smoke-scope',
      '--yes',
      '--scope-user-approved',
    ], workspace);
  });

  suiteTeardown(() => {
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('real CLI preview-confirmed switch, history, and rollback', async function () {
    if (!CLI_ENTRY) {
      this.skip();
      return;
    }
    this.timeout(90000);
    assert.equal(cli(['--version'], workspace).trim(), '0.36.1');

    const client = new WorkspaceCliClient(CLI_ENTRY);
    const before = await client.status(workspace);
    assert.ok(before, 'precondition: real attachment must exist');
    const firstId = before.attachments[0].attachment_id;
    const oldAsset = before.attachments[0].asset.id;
    const oldDigest = before.attachments[0].asset.digest;

    const preview = await client.switchPreview(
      workspace,
      firstId,
      path.join(workspace, 'b.kdna'),
    );
    assert.equal(preview.old_attachment.asset.id, oldAsset);
    assert.equal(preview.new_attachment.role, 'smoke-role');
    assert.deepEqual(preview.new_attachment.scope.applies_to, ['smoke-scope']);

    await client.switchApproved(workspace, firstId, path.join(workspace, 'b.kdna'));
    const switched = await client.status(workspace);
    assert.ok(switched, 'status must remain readable after switch');
    const attachment = switched.attachments[0];
    assert.notEqual(attachment.asset.id, oldAsset, 'asset identity must update');
    assert.equal(attachment.asset.digest, preview.new_attachment.asset.digest);
    assert.equal(attachment.history.length, 1, 'schema 0.3.0 history must be written');
    assert.equal(attachment.history[0].asset.id, oldAsset);
    assert.equal(attachment.history[0].role, 'smoke-role');
    assert.deepEqual(attachment.history[0].scope.applies_to, ['smoke-scope']);
    assert.equal(attachment.history[0].resolution_policy, 'load_when_clear_ask_when_ambiguous');
    assert.equal(attachment.history[0].update_policy, 'explicit_switch_only');
    assert.equal(attachment.scope.approval_source, 'user_explicit');

    await client.rollback(workspace, firstId);
    const restored = await client.status(workspace);
    assert.ok(restored, 'status must remain readable after rollback');
    assert.equal(restored.attachments[0].asset.id, oldAsset, 'rollback restores the old asset');
    assert.equal(restored.attachments[0].asset.digest, oldDigest);
    assert.equal(restored.attachments[0].role, 'smoke-role');
    assert.deepEqual(restored.attachments[0].scope.applies_to, ['smoke-scope']);
    assert.equal(restored.attachments[0].state, 'enabled');
    assert.equal(restored.attachments[0].history.length, 0, 'history is consumed by rollback');
  });

  test('the pinned CLI interactive confirmation fails safely in a VS Code terminal', async function () {
    if (!CLI_ENTRY) {
      this.skip();
      return;
    }
    if (process.platform !== 'darwin') {
      this.skip();
      return;
    }
    this.timeout(120000);

    // Documents the CLI-side limitation that forces the Host-confirmed path:
    // CLI 0.36.1's synchronous stdin confirmation read fails with EAGAIN on
    // the non-blocking VS Code terminal pty, so the UI cannot rely on the
    // CLI's terminal prompt. The base UI vector (no approval flags) must
    // still exit safely without writing anything.
    const record = JSON.parse(cli(['attachments', '--cwd', workspace], workspace));
    const attachmentId = record.attachments[0].attachment_id;
    const oldDigest = record.attachments[0].asset.digest;

    const wrapper = path.join(workspace, 'observe-wrapper.js');
    const wrapperLog = path.join(workspace, 'wrapper-result.json');
    fs.writeFileSync(wrapper,
      `'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
let stderr = '';
const result = spawnSync(
  process.execPath,
  [process.env.KDNA_OBSERVED_ENTRY, ...process.argv.slice(2)],
  { stdio: ['inherit', 'inherit', 'pipe'], encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
if (result.stderr) stderr = result.stderr;
fs.writeFileSync(
  process.env.KDNA_OBSERVED_LOG,
  JSON.stringify({ status: result.status, signal: result.signal, error: result.error ? result.error.message : null, stderr }),
);
process.exit(result.status === null ? 1 : result.status);
`);

    const uiArgs = switchAttachmentArgs(
      attachmentId,
      path.join(workspace, 'b.kdna'),
      workspace,
    );
    const terminal = vscode.window.createTerminal({
      name: 'KDNA Switch Limitation Observation',
      shellPath: process.execPath,
      shellArgs: [wrapper, ...uiArgs],
      cwd: vscode.Uri.file(workspace),
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        KDNA_OBSERVED_ENTRY: CLI_ENTRY,
        KDNA_OBSERVED_LOG: wrapperLog,
      },
    });
    const closed = closedTerminal(terminal);
    terminal.show();
    await delay(6000);
    terminal.sendText('y', true);
    await closed;

    const observed = JSON.parse(fs.readFileSync(wrapperLog, 'utf8'));
    assert.equal(observed.status, 1, 'interactive path exits safely without approval');
    assert.match(observed.stderr, /EAGAIN/, 'the EAGAIN limitation must be pinned');

    const after = JSON.parse(cli(['attachments', '--cwd', workspace], workspace));
    assert.equal(after.attachments[0].asset.digest, oldDigest, 'no partial write');
    assert.equal(after.attachments[0].history.length, 0, 'no history write on failure');
  });
});
