import * as vscode from 'vscode';
import { COMMANDS } from '../../constants';
import {
  WORKSPACE_CLI_VERSION,
  WorkspaceAttachment,
  WorkspaceAttachmentRecord,
  WorkspaceCliClient,
  WorkspaceCliError,
} from '../../utils/workspaceAttachments';

interface AttachmentItem extends vscode.QuickPickItem {
  attachment: WorkspaceAttachment;
}

interface ActionItem extends vscode.QuickPickItem {
  action: 'enable' | 'disable' | 'switch' | 'rollback' | 'remove';
}

function commaSeparated(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function phraseListError(value: string, required: boolean): string | null {
  const phrases = commaSeparated(value);
  if (required && phrases.length === 0) return 'Enter at least one explicit task scope.';
  if (phrases.length > 64) return 'Use no more than 64 task scopes.';
  if (phrases.some((phrase) => phrase.length > 512)) {
    return 'Each task scope must be 512 characters or fewer.';
  }
  return null;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!|>]/gu, '\\$&');
}

function shortDigest(value: string): string {
  return `${value.slice(0, 15)}…${value.slice(-8)}`;
}

function compactIdentity(value: string): string {
  return value.length <= 32 ? value : `${value.slice(0, 29)}…`;
}

function workspaceForActiveEditor(): vscode.WorkspaceFolder | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
}

function localWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return (vscode.workspace.workspaceFolders || []).filter(({ uri }) => uri.scheme === 'file');
}

export class WorkspaceAttachmentController implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly statusItem: vscode.StatusBarItem;
  private updateGeneration = 0;

  constructor() {
    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99,
    );
    this.statusItem.name = 'KDNA Workspace Attachments';
    this.statusItem.command = COMMANDS.WORKSPACE_STATUS;
    this.disposables.push(
      this.statusItem,
      vscode.commands.registerCommand(COMMANDS.WORKSPACE_STATUS, () => this.showStatus()),
      vscode.commands.registerCommand(COMMANDS.WORKSPACE_ATTACH, () => this.attach()),
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.refresh()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('kdna.workspaceCliEntry')) this.refresh();
      }),
    );

    const recordWatcher = vscode.workspace.createFileSystemWatcher(
      '**/.kdna/attachments.json',
    );
    recordWatcher.onDidCreate(() => this.refresh());
    recordWatcher.onDidChange(() => this.refresh());
    recordWatcher.onDidDelete(() => this.refresh());
    this.disposables.push(recordWatcher);
    void this.refresh();
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }

  private configuredClient(folder: vscode.WorkspaceFolder): WorkspaceCliClient | null {
    const configuredPath = vscode.workspace
      .getConfiguration('kdna', folder.uri)
      .get<string>('workspaceCliEntry', '')
      .trim();
    return configuredPath ? new WorkspaceCliClient(configuredPath) : null;
  }

  private async requireClient(folder: vscode.WorkspaceFolder): Promise<WorkspaceCliClient | null> {
    if (!vscode.workspace.isTrusted) {
      await vscode.window.showWarningMessage(
        'KDNA workspace controls stay disabled in Restricted Mode. Review the workspace, then use Workspaces: Manage Workspace Trust if you choose to trust it.',
      );
      return null;
    }
    const client = this.configuredClient(folder);
    if (client) return client;
    const choice = await vscode.window.showWarningMessage(
      `KDNA workspace controls are disabled until the exact CLI ${WORKSPACE_CLI_VERSION} src/cli.js entry is configured for this workspace.`,
      'Open Settings',
    );
    if (choice === 'Open Settings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'kdna.workspaceCliEntry',
      );
    }
    return null;
  }

  private async pickWorkspace(): Promise<vscode.WorkspaceFolder | null> {
    const folders = localWorkspaceFolders();
    if (folders.length === 0) {
      await vscode.window.showInformationMessage(
        'Open a local workspace folder before managing KDNA attachments.',
      );
      return null;
    }
    const active = workspaceForActiveEditor();
    if (active?.uri.scheme === 'file') return active;
    if (folders.length === 1) return folders[0];
    const picked = await vscode.window.showQuickPick(
      folders.map((folder) => ({
        label: folder.name,
        description: folder.uri.fsPath,
        folder,
      })),
      { placeHolder: 'Select the workspace whose KDNA attachments you want to manage' },
    );
    return picked?.folder || null;
  }

  private async statusFor(
    folder: vscode.WorkspaceFolder,
  ): Promise<WorkspaceAttachmentRecord | null | undefined> {
    const client = await this.requireClient(folder);
    if (!client) return undefined;
    try {
      return await client.status(folder.uri.fsPath);
    } catch (error) {
      await this.showSafeError(error);
      return undefined;
    }
  }

  private async showStatus(): Promise<void> {
    const folder = await this.pickWorkspace();
    if (!folder) return;
    const record = await this.statusFor(folder);
    if (record === undefined) return;
    if (!record || record.attachments.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        `No KDNA attachments are approved for ${folder.name}.`,
        'Attach File…',
      );
      if (choice === 'Attach File…') await this.attach(folder);
      return;
    }

    const selected = await vscode.window.showQuickPick<AttachmentItem>(
      record.attachments.map((attachment) => ({
        label: `${attachment.state === 'enabled' ? '$(pass-filled)' : '$(circle-slash)'} ${attachment.asset.id}@${attachment.asset.version}`,
        description: `${attachment.state} · ${shortDigest(attachment.asset.digest)}`,
        detail: `${attachment.role} · approved workspace relation · applies: ${attachment.scope.applies_to.join(', ') || 'none'} · excludes: ${attachment.scope.does_not_apply_to.join(', ') || 'none'}`,
        attachment,
      })),
      {
        placeHolder: `${folder.name}: select an attachment to view controls`,
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (selected) await this.showAttachmentActions(folder, selected.attachment);
  }

  private async showAttachmentActions(
    folder: vscode.WorkspaceFolder,
    attachment: WorkspaceAttachment,
  ): Promise<void> {
    const actions: ActionItem[] = [
      {
        label: attachment.state === 'enabled' ? '$(circle-slash) Disable' : '$(pass-filled) Enable',
        detail: attachment.state === 'enabled'
          ? 'Stop this attachment from loading in later tasks.'
          : 'Restore eligibility; task scope still controls whether it loads.',
        action: attachment.state === 'enabled' ? 'disable' : 'enable',
      },
      {
        label: '$(replace-all) Switch Exact File…',
        detail: 'The official CLI will show its exact preview and request confirmation.',
        action: 'switch',
      },
    ];
    if (attachment.history.length > 0) {
      actions.push({
        label: '$(history) Roll Back',
        detail: 'Restore the preceding retained snapshot without network access.',
        action: 'rollback',
      });
    }
    actions.push({
      label: '$(trash) Remove Relation',
      detail: 'Remove only this workspace relation; retained snapshot bytes are not deleted.',
      action: 'remove',
    });

    const selected = await vscode.window.showQuickPick(actions, {
      title: `${attachment.asset.id}@${attachment.asset.version}`,
      placeHolder: `${attachment.state} · ${attachment.asset.digest}`,
    });
    if (!selected) return;
    if (selected.action === 'switch') {
      await this.switchAttachment(folder, attachment);
      return;
    }
    await this.runDirectAction(folder, attachment, selected.action);
  }

  private async runDirectAction(
    folder: vscode.WorkspaceFolder,
    attachment: WorkspaceAttachment,
    action: 'enable' | 'disable' | 'rollback' | 'remove',
  ): Promise<void> {
    const client = await this.requireClient(folder);
    if (!client) return;

    if (action === 'rollback') {
      const choice = await vscode.window.showWarningMessage(
        `Roll back ${attachment.asset.id} to its preceding retained snapshot?`,
        { modal: true },
        'Roll Back',
      );
      if (choice !== 'Roll Back') return;
    }
    if (action === 'remove') {
      const choice = await vscode.window.showWarningMessage(
        `Remove ${attachment.asset.id} from this workspace? The retained snapshot is not deleted.`,
        { modal: true },
        'Remove Relation',
      );
      if (choice !== 'Remove Relation') return;
    }

    try {
      if (!await this.isCurrentAttachment(folder, client, attachment)) return;
      if (action === 'enable' || action === 'disable') {
        await client.setState(folder.uri.fsPath, attachment.attachment_id, action === 'enable' ? 'enabled' : 'disabled');
      } else if (action === 'rollback') {
        await client.rollback(folder.uri.fsPath, attachment.attachment_id);
      } else {
        await client.remove(folder.uri.fsPath, attachment.attachment_id);
      }
      await this.refresh();
      const undo = action === 'disable'
        ? await vscode.window.showInformationMessage(
          `KDNA: disabled ${attachment.asset.id}.`,
          'Enable',
        )
        : undefined;
      if (undo === 'Enable') {
        const disabledAttachment: WorkspaceAttachment = {
          ...attachment,
          state: 'disabled',
        };
        if (!await this.isCurrentAttachment(folder, client, disabledAttachment)) return;
        await client.setState(folder.uri.fsPath, attachment.attachment_id, 'enabled');
        await this.refresh();
      } else if (action !== 'disable') {
        const result = action === 'enable'
          ? 'enabled'
          : action === 'rollback'
            ? 'rolled back'
            : 'removed the workspace relation for';
        await vscode.window.showInformationMessage(`KDNA: ${result} ${attachment.asset.id}.`);
      }
    } catch (error) {
      await this.showSafeError(error);
    }
  }

  private async attach(existingFolder?: vscode.WorkspaceFolder): Promise<void> {
    const folder = existingFolder || await this.pickWorkspace();
    if (!folder) return;
    const client = await this.requireClient(folder);
    if (!client) return;
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: folder.uri,
      filters: { 'KDNA Asset': ['kdna'] },
      title: `Select the exact KDNA file to attach to ${folder.name}`,
    });
    const asset = files?.[0];
    if (!asset || asset.scheme !== 'file') return;
    const role = await vscode.window.showInputBox({
      title: 'KDNA attachment role',
      prompt: 'Name the narrow role this asset has in the workspace.',
      placeHolder: 'deployment-review',
      validateInput: (value) => value.trim() && value.length <= 512
        ? null
        : 'Enter a role of 1–512 characters.',
    });
    if (!role) return;
    const appliesText = await vscode.window.showInputBox({
      title: 'KDNA applies to',
      prompt: 'Enter one or more comma-separated task scopes.',
      placeHolder: 'deployment review, release planning',
      validateInput: (value) => phraseListError(value, true),
    });
    if (!appliesText) return;
    const excludesText = await vscode.window.showInputBox({
      title: 'KDNA does not apply to',
      prompt: 'Optional comma-separated exclusions. Leave empty only when the scope is already narrow.',
      placeHolder: 'poetry, personal messages',
      validateInput: (value) => phraseListError(value, false),
    });
    if (excludesText === undefined) return;

    const args = [
      'attach',
      asset.fsPath,
      '--cwd',
      folder.uri.fsPath,
      '--role',
      role.trim(),
      ...commaSeparated(appliesText).flatMap((value) => ['--applies-to', value]),
      ...commaSeparated(excludesText).flatMap((value) => ['--does-not-apply-to', value]),
    ];
    await this.launchApprovalTerminal(folder, client, 'KDNA Attach', args);
  }

  private async switchAttachment(
    folder: vscode.WorkspaceFolder,
    attachment: WorkspaceAttachment,
  ): Promise<void> {
    const client = await this.requireClient(folder);
    if (!client) return;
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: folder.uri,
      filters: { 'KDNA Asset': ['kdna'] },
      title: `Select the exact replacement for ${attachment.asset.id}`,
    });
    const asset = files?.[0];
    if (!asset || asset.scheme !== 'file') return;
    try {
      if (!await this.isCurrentAttachment(folder, client, attachment)) return;
      await this.launchApprovalTerminal(folder, client, 'KDNA Switch', [
        'switch',
        attachment.attachment_id,
        asset.fsPath,
        '--cwd',
        folder.uri.fsPath,
      ]);
    } catch (error) {
      await this.showSafeError(error);
    }
  }

  private async isCurrentAttachment(
    folder: vscode.WorkspaceFolder,
    client: WorkspaceCliClient,
    selected: WorkspaceAttachment,
  ): Promise<boolean> {
    const record = await client.status(folder.uri.fsPath);
    const current = record?.attachments.find(
      ({ attachment_id: attachmentId }) => attachmentId === selected.attachment_id,
    );
    if (current && JSON.stringify(current) === JSON.stringify(selected)) return true;
    await this.refresh();
    await vscode.window.showWarningMessage(
      'KDNA workspace state changed after these controls opened. Reopen Workspace Attachments to act on the current state.',
    );
    return false;
  }

  private async launchApprovalTerminal(
    folder: vscode.WorkspaceFolder,
    client: WorkspaceCliClient,
    name: string,
    args: string[],
  ): Promise<void> {
    try {
      const executable = await client.executable();
      const terminal = vscode.window.createTerminal({
        name,
        shellPath: process.execPath,
        shellArgs: [executable, ...args],
        cwd: folder.uri,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      });
      const closeListener = vscode.window.onDidCloseTerminal((closed) => {
        if (closed !== terminal) return;
        closeListener.dispose();
        void this.refresh();
      });
      terminal.show();
    } catch (error) {
      await this.showSafeError(error);
    }
  }

  private async refresh(): Promise<void> {
    const generation = ++this.updateGeneration;
    const folders = localWorkspaceFolders();
    if (folders.length === 0) {
      this.statusItem.hide();
      return;
    }
    const folder = workspaceForActiveEditor() || (folders.length === 1 ? folders[0] : undefined);
    if (!folder || folder.uri.scheme !== 'file') {
      this.setStatus('$(folder) KDNA: choose workspace', 'Choose a workspace to view its approved KDNA attachments.');
      return;
    }
    if (!vscode.workspace.isTrusted) {
      this.setStatus(
        '$(shield) KDNA: trust required',
        'Workspace attachment controls do not execute a configured CLI in Restricted Mode.',
      );
      return;
    }
    const client = this.configuredClient(folder);
    if (!client) {
      this.setStatus('$(warning) KDNA: CLI required', `Configure kdna.workspaceCliEntry for ${folder.name}.`);
      return;
    }
    try {
      const record = await client.status(folder.uri.fsPath);
      if (generation !== this.updateGeneration) return;
      if (!record || record.attachments.length === 0) {
        this.setStatus('$(circle-slash) KDNA: none', `${folder.name} has no approved KDNA attachment.`);
        return;
      }
      const enabled = record.attachments.filter(({ state }) => state === 'enabled');
      if (enabled.length === 0) {
        this.setStatus('$(circle-slash) KDNA: disabled', `${record.attachments.length} attachment(s); all disabled.`);
        return;
      }
      const text = enabled.length === 1
        ? `$(pass-filled) KDNA: ${compactIdentity(enabled[0].asset.id)}@${enabled[0].asset.version}`
        : `$(pass-filled) KDNA: ${enabled.length} enabled`;
      const tooltip = new vscode.MarkdownString(undefined, false);
      tooltip.appendMarkdown(`**${escapeMarkdown(folder.name)} KDNA attachments**\n\n`);
      for (const attachment of record.attachments) {
        tooltip.appendMarkdown(
          `${attachment.state === 'enabled' ? 'Enabled' : 'Disabled'} · ` +
          `\`${escapeMarkdown(attachment.asset.id)}@${escapeMarkdown(attachment.asset.version)}\`  \n` +
          `Digest: \`${escapeMarkdown(attachment.asset.digest)}\`  \n` +
          'Reason: user-approved workspace relation; task applicability remains Host-controlled  \n' +
          `Role: ${escapeMarkdown(attachment.role)}  \n` +
          `Applies: ${escapeMarkdown(attachment.scope.applies_to.join(', ') || 'none')}  \n` +
          `Excludes: ${escapeMarkdown(attachment.scope.does_not_apply_to.join(', ') || 'none')}\n\n`,
        );
      }
      this.setStatus(text, tooltip);
    } catch {
      if (generation !== this.updateGeneration) return;
      this.setStatus('$(warning) KDNA: status unavailable', 'The configured CLI could not return valid workspace status.');
    }
  }

  private setStatus(text: string, tooltip: string | vscode.MarkdownString): void {
    this.statusItem.text = text;
    this.statusItem.tooltip = tooltip;
    this.statusItem.accessibilityInformation = {
      label: text.replace(/\$\([^)]+\)\s*/gu, ''),
      role: 'button',
    };
    this.statusItem.show();
  }

  private async showSafeError(error: unknown): Promise<void> {
    const message = error instanceof WorkspaceCliError
      ? error.message
      : 'KDNA workspace controls could not complete the request.';
    await vscode.window.showErrorMessage(`KDNA: ${message}`);
  }
}
