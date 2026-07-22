/**
 * KDNA VS Code Extension — entry point.
 */

import * as vscode from 'vscode';
import { DomainTreeProvider } from './features/treeView/domainTreeProvider';
import { DiagnosticProvider } from './features/diagnostics/diagnosticProvider';
import { registerCommands } from './features/commands/commandRegistry';
import { KdnaHoverProvider } from './features/hovers/hoverProvider';
import { BannedTermDecorator } from './features/decorations/bannedTermDecorator';
import { StatusBarController } from './features/statusBar/statusBarController';
import { WorkspaceAttachmentController } from './features/workspace/workspaceAttachmentController';
import { KDNA_FILE_PATTERN, KDNA_MANIFEST_PATTERN } from './constants';

export function activate(context: vscode.ExtensionContext) {
  // Tree View
  const treeProvider = new DomainTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('kdna-domains', treeProvider),
  );

  // Diagnostics
  const diagProvider = new DiagnosticProvider(context);
  context.subscriptions.push(diagProvider);

  // Commands
  registerCommands(context);

  // Hovers
  context.subscriptions.push(new KdnaHoverProvider(context));

  // Banned-term decorations
  context.subscriptions.push(new BannedTermDecorator(context));

  // Status Bar
  context.subscriptions.push(new StatusBarController());

  // Approved workspace attachment status and controls. This controller calls
  // the exact configured CLI; it never reads, parses, or mutates the persistent
  // record itself.
  context.subscriptions.push(new WorkspaceAttachmentController());

  // File watchers for tree refresh
  const kdnaWatcher = vscode.workspace.createFileSystemWatcher(KDNA_FILE_PATTERN);
  const manifestWatcher = vscode.workspace.createFileSystemWatcher(KDNA_MANIFEST_PATTERN);
  const refreshTree = () => treeProvider.refresh();
  kdnaWatcher.onDidCreate(refreshTree);
  kdnaWatcher.onDidDelete(refreshTree);
  manifestWatcher.onDidCreate(refreshTree);
  manifestWatcher.onDidDelete(refreshTree);
  context.subscriptions.push(kdnaWatcher, manifestWatcher);
}

export function deactivate() {}
