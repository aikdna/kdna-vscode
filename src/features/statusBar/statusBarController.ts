/**
 * Status bar controller — shows active KDNA domain info.
 */

import * as vscode from 'vscode';
import { findDomainDir, getDomainInfo, isKdnaFile } from '../../utils/kdnaFiles';
import { COMMANDS } from '../../constants';

export class StatusBarController extends vscode.Disposable {
  private item: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    super(() => this.dispose());

    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.command = COMMANDS.PREVIEW;
    this.item.tooltip = 'Click to preview KDNA domain';
    this.disposables.push(this.item);

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => this.update(editor)),
      vscode.workspace.onDidSaveTextDocument(() => {
        this.update(vscode.window.activeTextEditor);
      }),
    );

    this.update(vscode.window.activeTextEditor);
  }

  private async update(editor: vscode.TextEditor | undefined) {
    if (!editor || !isKdnaFile(editor.document.uri)) {
      this.item.hide();
      return;
    }

    const domainDir = await findDomainDir(editor.document.uri);
    if (!domainDir) {
      this.item.hide();
      return;
    }

    const info = await getDomainInfo(domainDir);
    if (!info) {
      this.item.hide();
      return;
    }

    this.item.text = `$(globe) ${info.name} v${info.version} (${info.status})`;
    this.item.show();
  }

  dispose() {
    this.item.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
