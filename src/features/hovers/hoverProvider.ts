/**
 * Hover provider — shows KDNA term definitions on hover.
 */

import * as vscode from 'vscode';
import { KDNA_FILE_PATTERN } from '../../constants';
import { readDomainData, findDomainDir, readJsonFile } from '../../utils/kdnaFiles';

export class KdnaHoverProvider extends vscode.Disposable {
  private provider: vscode.Disposable;

  constructor(private context: vscode.ExtensionContext) {
    super(() => this.dispose());
    this.provider = vscode.languages.registerHoverProvider(
      { pattern: KDNA_FILE_PATTERN },
      { provideHover: this.provideHover.bind(this) },
    );
  }

  private async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | null> {
    const wordRange = document.getWordRangeAtPosition(position, /[\w_]+/);
    if (!wordRange) return null;

    const word = document.getText(wordRange).toLowerCase();
    if (word.length < 3) return null;

    const domainDir = await findDomainDir(document.uri);
    if (!domainDir) return null;

    const coreData = await readJsonFile<any>(
      vscode.Uri.joinPath(domainDir, 'KDNA_Core.json'),
    );
    const patternsData = await readJsonFile<any>(
      vscode.Uri.joinPath(domainDir, 'KDNA_Patterns.json'),
    );

    if (!coreData && !patternsData) return null;

    const contents: vscode.MarkdownString[] = [];

    // Search ontology
    if (coreData?.ontology) {
      for (const concept of coreData.ontology) {
        const id = (concept.id || '').toLowerCase().replace(/_/g, ' ');
        const oneSentence = (concept.one_sentence || '').toLowerCase();
        if (id.includes(word) || oneSentence.includes(word)) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**${concept.one_sentence || concept.id}**\n\n`);
          md.appendMarkdown(`${concept.essence || ''}\n\n`);
          md.appendMarkdown(`*Boundary:* ${concept.boundary || ''}\n\n`);
          md.appendMarkdown(`*Trigger:* ${concept.trigger_signal || ''}`);
          contents.push(md);
          break;
        }
      }
    }

    // Search banned terms
    if (patternsData?.terminology?.banned_terms) {
      for (const bt of patternsData.terminology.banned_terms) {
        if (bt.term?.toLowerCase().includes(word)) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`⚠️ **Banned Term:** "${bt.term}"\n\n`);
          md.appendMarkdown(`*Why:* ${bt.why || ''}\n\n`);
          md.appendMarkdown(`*Replace with:* **${bt.replace_with || ''}**`);
          contents.push(md);
          break;
        }
      }
    }

    // Search standard terms
    if (patternsData?.terminology?.standard_terms) {
      for (const st of patternsData.terminology.standard_terms) {
        if (st.term?.toLowerCase().includes(word)) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**${st.term}**\n\n`);
          md.appendMarkdown(`${st.definition || ''}`);
          contents.push(md);
          break;
        }
      }
    }

    // Search misunderstandings
    if (patternsData?.misunderstandings) {
      for (const m of patternsData.misunderstandings) {
        const wrong = (m.wrong || '').toLowerCase();
        const correct = (m.correct || '').toLowerCase();
        if (wrong.includes(word) || correct.includes(word)) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**Misunderstanding:**\n\n`);
          md.appendMarkdown(`❌ *Wrong:* ${m.wrong}\n\n`);
          md.appendMarkdown(`✅ *Correct:* ${m.correct}\n\n`);
          md.appendMarkdown(`*Key distinction:* ${m.key_distinction || ''}`);
          contents.push(md);
          break;
        }
      }
    }

    return contents.length > 0
      ? new vscode.Hover(contents, wordRange)
      : null;
  }

  dispose() {
    this.provider.dispose();
  }
}
