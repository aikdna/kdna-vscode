/**
 * TreeView provider for KDNA Domains panel.
 */

import * as vscode from 'vscode';
import { findDomainDirs, getDomainInfo, readJsonFile } from '../../utils/kdnaFiles';
import { KDNA_ALL_FILES } from '../../constants';

export class DomainTreeProvider implements vscode.TreeDataProvider<KDNATreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<KDNATreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: KDNATreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: KDNATreeItem): Promise<KDNATreeItem[]> {
    if (!element) {
      // Root: show domain directories
      const dirs = await findDomainDirs();
      return dirs.map((dir) => new DomainItem(dir));
    }

    if (element instanceof DomainItem) {
      // Show files in the domain
      return this.getDomainFiles(element);
    }

    if (element instanceof FileItem) {
      // Show sections in the file
      return this.getFileSections(element);
    }

    return [];
  }

  private async getDomainFiles(domain: DomainItem): Promise<FileItem[]> {
    const items: FileItem[] = [];

    // Manifest
    const manifestUri = vscode.Uri.joinPath(domain.domainDir, 'kdna.json');
    items.push(new FileItem(manifestUri, 'kdna.json', 'Manifest'));

    // KDNA files
    for (const filename of KDNA_ALL_FILES) {
      const fileUri = vscode.Uri.joinPath(domain.domainDir, filename);
      try {
        await vscode.workspace.fs.stat(fileUri);
        const data = await readJsonFile<any>(fileUri);
        const summary = data ? this.getFileSummary(filename, data) : '';
        items.push(new FileItem(fileUri, filename, summary));
      } catch {
        // File doesn't exist — skip
      }
    }

    return items;
  }

  private getFileSummary(filename: string, data: any): string {
    const parts: string[] = [];
    if (filename === 'KDNA_Core.json') {
      if (data.axioms?.length) parts.push(`${data.axioms.length} axioms`);
      if (data.ontology?.length) parts.push(`${data.ontology.length} concepts`);
      if (data.frameworks?.length) parts.push(`${data.frameworks.length} frameworks`);
    } else if (filename === 'KDNA_Patterns.json') {
      if (data.terminology?.banned_terms?.length) parts.push(`${data.terminology.banned_terms.length} banned`);
      if (data.misunderstandings?.length) parts.push(`${data.misunderstandings.length} misunderstandings`);
      if (data.self_check?.length) parts.push(`${data.self_check.length} checks`);
    } else if (filename === 'KDNA_Scenarios.json') {
      if (data.scenes?.length) parts.push(`${data.scenes.length} scenes`);
    } else if (filename === 'KDNA_Cases.json') {
      if (data.cases?.length) parts.push(`${data.cases.length} cases`);
    } else if (filename === 'KDNA_Reasoning.json') {
      if (data.reasoning_chains?.length) parts.push(`${data.reasoning_chains.length} chains`);
    } else if (filename === 'KDNA_Evolution.json') {
      if (data.stages?.length) parts.push(`${data.stages.length} stages`);
    }
    return parts.join(', ');
  }

  private async getFileSections(file: FileItem): Promise<SectionItem[]> {
    const data = await readJsonFile<any>(file.fileUri);
    if (!data) return [];

    const sections: SectionItem[] = [];
    const filename = file.filename;

    if (filename === 'KDNA_Core.json') {
      if (data.axioms?.length) sections.push(new SectionItem('Axioms', data.axioms.length, file.fileUri));
      if (data.ontology?.length) sections.push(new SectionItem('Concepts', data.ontology.length, file.fileUri));
      if (data.frameworks?.length) sections.push(new SectionItem('Frameworks', data.frameworks.length, file.fileUri));
      if (data.core_structure?.length) sections.push(new SectionItem('Core Structure', data.core_structure.length, file.fileUri));
      if (data.stances?.length) sections.push(new SectionItem('Stances', data.stances.length, file.fileUri));
    } else if (filename === 'KDNA_Patterns.json') {
      if (data.terminology?.standard_terms?.length) sections.push(new SectionItem('Standard Terms', data.terminology.standard_terms.length, file.fileUri));
      if (data.terminology?.banned_terms?.length) sections.push(new SectionItem('Banned Terms', data.terminology.banned_terms.length, file.fileUri));
      if (data.misunderstandings?.length) sections.push(new SectionItem('Misunderstandings', data.misunderstandings.length, file.fileUri));
      if (data.self_check?.length) sections.push(new SectionItem('Self-Checks', data.self_check.length, file.fileUri));
    } else if (filename === 'KDNA_Scenarios.json') {
      if (data.scenes?.length) sections.push(new SectionItem('Scenes', data.scenes.length, file.fileUri));
    } else if (filename === 'KDNA_Cases.json') {
      if (data.cases?.length) sections.push(new SectionItem('Cases', data.cases.length, file.fileUri));
    } else if (filename === 'KDNA_Reasoning.json') {
      if (data.reasoning_chains?.length) sections.push(new SectionItem('Reasoning Chains', data.reasoning_chains.length, file.fileUri));
    } else if (filename === 'KDNA_Evolution.json') {
      if (data.stages?.length) sections.push(new SectionItem('Stages', data.stages.length, file.fileUri));
      if (data.evolution_layers?.length) sections.push(new SectionItem('Layers', data.evolution_layers.length, file.fileUri));
      if (data.measurement?.length) sections.push(new SectionItem('Measurements', data.measurement.length, file.fileUri));
    }

    return sections;
  }
}

export class KDNATreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
  }
}

export class DomainItem extends KDNATreeItem {
  constructor(public readonly domainDir: vscode.Uri) {
    super('...', vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon('globe');
    this.contextValue = 'kdna-domain';
    this.loadInfo();
  }

  private async loadInfo() {
    const info = await getDomainInfo(this.domainDir);
    (this as any).label = info?.name || this.domainDir.path.split('/').pop() || 'Unknown';
    this.description = info ? `v${info.version} (${info.status})` : '';
    this.tooltip = info?.description || (this as any).label;
  }
}

export class FileItem extends KDNATreeItem {
  constructor(
    public readonly fileUri: vscode.Uri,
    public readonly filename: string,
    summary: string,
  ) {
    super(filename, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = summary;
    this.iconPath = vscode.ThemeIcon.File;
    this.command = {
      command: 'vscode.open',
      arguments: [fileUri],
      title: 'Open File',
    };
    this.contextValue = 'kdna-file';
  }
}

export class SectionItem extends KDNATreeItem {
  constructor(
    name: string,
    count: number,
    _fileUri: vscode.Uri,
  ) {
    super(`${name} (${count})`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('symbol-field');
    this.contextValue = 'kdna-section';
  }
}
