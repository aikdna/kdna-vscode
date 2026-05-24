/**
 * Webview preview panel — renders KDNA domain HTML previews.
 */

import * as vscode from 'vscode';
import { renderDomainPreview, renderKdnaPreview } from '../../utils/kdnaLoader';
import { getDomainInfo } from '../../utils/kdnaFiles';

export class PreviewPanel {
  public static currentPanel: PreviewPanel | undefined;
  private static readonly viewType = 'kdnaPreview';

  private readonly panel: vscode.WebviewPanel;
  private sourceUri: vscode.Uri;
  private isKdnaFile: boolean;
  private disposables: vscode.Disposable[] = [];

  /**
   * Create or show the preview panel for a domain or .kdna file.
   */
  public static createOrShow(sourceUri: vscode.Uri, isKdnaFile: boolean) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (PreviewPanel.currentPanel) {
      PreviewPanel.currentPanel.panel.reveal(column);
      PreviewPanel.currentPanel.update(sourceUri, isKdnaFile);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      'KDNA Preview',
      column,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    PreviewPanel.currentPanel = new PreviewPanel(panel, sourceUri, isKdnaFile);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    sourceUri: vscode.Uri,
    isKdnaFile: boolean,
  ) {
    this.panel = panel;
    this.sourceUri = sourceUri;
    this.isKdnaFile = isKdnaFile;

    this.update(sourceUri, isKdnaFile);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async update(sourceUri: vscode.Uri, isKdnaFile: boolean) {
    this.sourceUri = sourceUri;
    this.isKdnaFile = isKdnaFile;

    this.panel.webview.html = '<p style="padding:20px;color:var(--vscode-descriptionForeground)">Loading preview...</p>';

    try {
      const html = isKdnaFile
        ? await renderKdnaPreview(sourceUri)
        : await renderDomainPreview(sourceUri);

      this.panel.webview.html = await this.wrapHtml(html, sourceUri, isKdnaFile);
    } catch (err: any) {
      this.panel.webview.html = `<p style="padding:20px;color:var(--vscode-errorForeground)">Error: ${err.message}</p>`;
    }
  }

  private async wrapHtml(body: string, sourceUri: vscode.Uri, isKdnaFile: boolean): Promise<string> {
    let title = 'KDNA Preview';

    if (!isKdnaFile) {
      const info = await getDomainInfo(sourceUri);
      title = info?.name || 'KDNA Preview';
    }

    // Extract the body content from the rendered HTML (skip DOCTYPE/html/head wrapper)
    const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : body;
    const styleMatch = body.match(/<style[^>]*>([\s\S]*)<\/style>/i);
    const styles = styleMatch ? styleMatch[1] : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${this.escHtml(title)} — KDNA Preview</title>
<style>
body {
  padding: 0;
  margin: 0;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}
${styles.replace(/:root\{[^}]*\}/g, ':root{--bg:var(--vscode-editor-background);--bg2:var(--vscode-sideBar-background);--border:var(--vscode-panel-border);--text:var(--vscode-editor-foreground);--dim:var(--vscode-descriptionForeground);--muted:var(--vscode-disabledForeground);--accent:var(--vscode-textLink-foreground);--green:#73d18d;--red:#f48771;--blue:#91aef3}')}
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  private escHtml(s: string): string {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  public dispose() {
    PreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) x.dispose();
    }
  }
}
