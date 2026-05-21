/**
 * Diagnostic provider — validates KDNA files and reports issues in the Problems panel.
 */

import * as vscode from 'vscode';
import { lintDomainDir } from '../../utils/kdnaLoader';
import { isKdnaFile, findDomainDir } from '../../utils/kdnaFiles';

export class DiagnosticProvider extends vscode.Disposable {
  private collection: vscode.DiagnosticCollection;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(private context: vscode.ExtensionContext) {
    super(() => this.dispose());

    this.collection = vscode.languages.createDiagnosticCollection('kdna');

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.onDocumentChange(doc)),
      vscode.workspace.onDidOpenTextDocument((doc) => this.onDocumentChange(doc)),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.collection.delete(doc.uri);
      }),
    );
  }

  private onDocumentChange(doc: vscode.TextDocument) {
    if (!isKdnaFile(doc.uri)) return;

    // Debounce: 500ms
    const key = doc.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        this.validate(doc.uri);
      }, 500),
    );
  }

  private async validate(uri: vscode.Uri) {
    const domainDir = await findDomainDir(uri);
    if (!domainDir) return;

    const result = await lintDomainDir(domainDir);

    // Map errors to diagnostics
    const diagnostics: vscode.Diagnostic[] = [];

    for (const error of result.errors) {
      const range = this.errorToRange(error, uri);
      const diagnostic = new vscode.Diagnostic(
        range,
        error,
        vscode.DiagnosticSeverity.Error,
      );
      diagnostic.source = 'kdna';
      diagnostics.push(diagnostic);
    }

    for (const warning of result.warnings) {
      const range = this.errorToRange(warning, uri);
      const diagnostic = new vscode.Diagnostic(
        range,
        warning,
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = 'kdna';
      diagnostics.push(diagnostic);
    }

    this.collection.set(uri, diagnostics);
  }

  /**
   * Attempt to map an error string like "KDNA_Core.json.axioms[2].one_sentence: missing required field"
   * to a Range in the document. Falls back to the first line if parsing fails.
   */
  private errorToRange(errorStr: string, uri: vscode.Uri): vscode.Range {
    // Try to extract a JSON pointer path
    const match = errorStr.match(/^(\S+?):\s/);
    if (!match) return new vscode.Range(0, 0, 0, 1);

    const path = match[1];
    // e.g., "KDNA_Core.json.axioms[2].one_sentence" or "KDNA_Core.json.meta.version"
    const parts = path.split('.');

    // Check if this error is for the current file
    const filename = uri.path.split('/').pop() || '';
    if (parts[0] !== filename) {
      // Error is for a different file in the domain — still show but mark at line 0
      return new vscode.Range(0, 0, 0, 1);
    }

    // Open the document and try to find the JSON path
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (!doc) return new vscode.Range(0, 0, 0, 1);

    const jsonPath = parts.slice(1); // ['axioms[2]', 'one_sentence'] or ['meta', 'version']
    const range = this.findJsonPathRange(doc, jsonPath);
    return range || new vscode.Range(0, 0, 0, 1);
  }

  /**
   * Simple JSON path finder that walks the text to find approximate ranges.
   */
  private findJsonPathRange(
    doc: vscode.TextDocument,
    pathParts: string[],
  ): vscode.Range | null {
    const text = doc.getText();
    let searchOffset = 0;

    for (const part of pathParts) {
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        // Array access: find the array key, then skip to the Nth element
        const key = arrayMatch[1];
        const index = parseInt(arrayMatch[2]);

        // Find the key
        const keyPattern = `"${key}"`;
        const keyPos = text.indexOf(keyPattern, searchOffset);
        if (keyPos === -1) return null;

        // Find the opening bracket of the array
        const bracketPos = text.indexOf('[', keyPos);
        if (bracketPos === -1) return null;
        searchOffset = bracketPos + 1;

        // Skip to the Nth element
        for (let i = 0; i < index; i++) {
          // Find next comma at the same nesting level
          let depth = 0;
          let pos = searchOffset;
          while (pos < text.length) {
            const ch = text[pos];
            if (ch === '[' || ch === '{') depth++;
            else if (ch === ']' || ch === '}') depth--;
            else if (ch === ',' && depth === 0) break;
            pos++;
          }
          if (pos >= text.length) return null;
          searchOffset = pos + 1;
        }
      } else {
        // Object key
        const keyPattern = `"${part}"`;
        const keyPos = text.indexOf(keyPattern, searchOffset);
        if (keyPos === -1) return null;
        searchOffset = keyPos + keyPattern.length;
      }
    }

    // Find the value at the current position
    const colonPos = text.indexOf(':', searchOffset);
    if (colonPos === -1) return null;

    const startLine = doc.positionAt(colonPos + 1);
    const endLine = new vscode.Position(startLine.line, doc.lineAt(startLine.line).text.length);
    return new vscode.Range(startLine, endLine);
  }

  dispose() {
    this.collection.dispose();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
