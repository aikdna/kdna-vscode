/**
 * Banned-term decorator — underlines banned terms in KDNA JSON files.
 */

import * as vscode from 'vscode';
import { findDomainDir, readJsonFile } from '../../utils/kdnaFiles';

export class BannedTermDecorator extends vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private timeout: NodeJS.Timeout | undefined;

  constructor(private context: vscode.ExtensionContext) {
    super(() => this.dispose());

    this.decorationType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline wavy #f48771',
      overviewRulerColor: '#f48771',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => this.decorate(editor)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (vscode.window.activeTextEditor?.document === e.document) {
          this.debounceDecorate(vscode.window.activeTextEditor);
        }
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document === doc) this.decorate(editor);
      }),
    );

    // Initial decoration
    if (vscode.window.activeTextEditor) {
      this.decorate(vscode.window.activeTextEditor);
    }
  }

  private debounceDecorate(editor: vscode.TextEditor) {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.decorate(editor), 300);
  }

  private async decorate(editor: vscode.TextEditor | undefined) {
    if (!editor) return;

    const doc = editor.document;
    if (!doc.fileName.match(/KDNA_.*\.json$/)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const domainDir = await findDomainDir(doc.uri);
    if (!domainDir) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const patternsData = await readJsonFile<any>(
      vscode.Uri.joinPath(domainDir, 'KDNA_Patterns.json'),
    );
    const bannedTerms = patternsData?.terminology?.banned_terms || [];
    if (!bannedTerms.length) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const text = doc.getText();
    const decorations: vscode.DecorationOptions[] = [];

    for (const bt of bannedTerms) {
      const term = bt.term;
      if (!term) continue;

      // Search for the term in string values (inside double quotes)
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`"([^"]*\\b${escaped}\\b[^"]*)"`, 'gi');

      let match;
      while ((match = regex.exec(text)) !== null) {
        // Don't highlight if it's a key name or inside a "term" field definition
        const beforeMatch = text.substring(Math.max(0, match.index - 30), match.index);
        if (beforeMatch.includes('"term"') || beforeMatch.includes('"replace_with"')) continue;

        const startPos = doc.positionAt(match.index + 1); // skip opening quote
        const endPos = doc.positionAt(match.index + match[0].length - 1); // skip closing quote
        decorations.push({
          range: new vscode.Range(startPos, endPos),
          hoverMessage: `Banned term: **${bt.term}**\n\n${bt.why || ''}\n\nUse: **${bt.replace_with || ''}**`,
        });
      }
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  dispose() {
    if (this.timeout) clearTimeout(this.timeout);
    this.decorationType.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
