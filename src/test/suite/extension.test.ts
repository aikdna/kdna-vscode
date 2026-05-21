/**
 * Extension activation tests.
 *
 * These run inside VS Code's Electron environment.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Activation', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('aikdna.kdna-vscode'));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('aikdna.kdna-vscode');
    if (!ext) {
      assert.fail('Extension not found');
      return;
    }
    await ext.activate();
    assert.ok(ext.isActive, 'Extension should be active after activation');
  });
});

suite('Commands Registration', () => {
  test('All KDNA commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const kdnaCommands = commands.filter((c) => c.startsWith('kdna.'));

    assert.ok(kdnaCommands.includes('kdna.validate'), 'validate command missing');
    assert.ok(kdnaCommands.includes('kdna.pack'), 'pack command missing');
    assert.ok(kdnaCommands.includes('kdna.unpack'), 'unpack command missing');
    assert.ok(kdnaCommands.includes('kdna.preview'), 'preview command missing');
    assert.ok(kdnaCommands.includes('kdna.install'), 'install command missing');
    assert.ok(kdnaCommands.includes('kdna.create'), 'create command missing');
  });
});

suite('TreeView Registration', () => {
  test('KDNA Domains view should be registered', async () => {
    // Tree views are registered in package.json contributes.views
    // We verify by checking the extension manifest
    const ext = vscode.extensions.getExtension('aikdna.kdna-vscode');
    if (!ext) {
      assert.fail('Extension not found');
      return;
    }
    const contributes = ext.packageJSON.contributes;
    assert.ok(contributes, 'Extension should have contributes');
    assert.ok(contributes.views, 'Should have views contribution');
    assert.ok(contributes.views.explorer, 'Should have explorer view');
    const viewIds = contributes.views.explorer.map((v: any) => v.id);
    assert.ok(viewIds.includes('kdna-domains'), 'kdna-domains view should be registered');
  });
});
