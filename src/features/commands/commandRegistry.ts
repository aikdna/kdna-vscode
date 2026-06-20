/**
 * Command registry — registers all KDNA extension commands.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as JSZip from 'jszip';
import { COMMANDS } from '../../constants';
import {
  findDomainDirs,
  findDomainDir,
  isKdnaPackageFile,
  readDomainData,
  readJsonFile,
  isKdnaDomainDir,
  isKdnaFile,
  getDomainInfo,
} from '../../utils/kdnaFiles';
import {
  lintDomainDir,
  validateDomainDir,
  renderDomainPreview,
  renderKdnaPreview,
} from '../../utils/kdnaLoader';
import { DomainTreeProvider } from '../treeView/domainTreeProvider';
import { PreviewPanel } from '../webview/previewPanel';

let outputChannel: vscode.OutputChannel;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('KDNA');
  }
  return outputChannel;
}

async function pickDomainDir(): Promise<vscode.Uri | null> {
  const dirs = await findDomainDirs();
  if (dirs.length === 0) {
    vscode.window.showInformationMessage('No KDNA domains found in workspace.');
    return null;
  }

  if (dirs.length === 1) return dirs[0];

  const items = await Promise.all(
    dirs.map(async (dir) => {
      const info = await getDomainInfo(dir);
      return {
        label: info?.name || dir.path.split('/').pop() || 'Unknown',
        description: info ? `v${info.version}` : '',
        detail: info?.description,
        uri: dir,
      };
    }),
  );

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a KDNA domain',
  });
  return picked?.uri || null;
}

async function pickKdnaFile(): Promise<vscode.Uri | null> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    filters: { 'KDNA Asset': ['kdna'] },
    title: 'Select .kdna file',
  });
  return uris?.[0] || null;
}

async function pickDomainOrKdna(): Promise<vscode.Uri | null> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Domain Directory', description: 'Select a KDNA domain folder in the workspace' },
      { label: '.kdna File', description: 'Select a canonical .kdna asset file' },
    ],
    { placeHolder: 'Choose source type' },
  );
  if (!choice) return null;
  if (choice.label === 'Domain Directory') return pickDomainDir();
  return pickKdnaFile();
}

// ─── Validate ────────────────────────────────────────────────────────

async function cmdValidate(domainUri?: vscode.Uri) {
  if (!domainUri) {
    const doc = vscode.window.activeTextEditor?.document;
    if (doc && isKdnaFile(doc.uri)) {
      domainUri = (await findDomainDir(doc.uri)) || undefined;
    }
    if (!domainUri) {
      domainUri = (await pickDomainDir()) || undefined;
    }
  }
  if (!domainUri) return;

  const channel = getOutputChannel();
  channel.clear();
  channel.appendLine(`KDNA Validate: ${domainUri.fsPath}`);
  channel.appendLine('');

  const { schemaResult, crossResult } = await validateDomainDir(domainUri);

  if (schemaResult.errors.length || crossResult.errors.length) {
    channel.appendLine('--- Schema Errors ---');
    for (const e of schemaResult.errors) channel.appendLine(`  ${e}`);
    channel.appendLine('');
    channel.appendLine('--- Cross-File Errors ---');
    for (const e of crossResult.errors) channel.appendLine(`  ${e}`);
  }

  if (schemaResult.warnings.length || crossResult.warnings.length) {
    channel.appendLine('--- Warnings ---');
    for (const w of schemaResult.warnings) channel.appendLine(`  ${w}`);
    for (const w of crossResult.warnings) channel.appendLine(`  ${w}`);
  }

  const totalErrors = schemaResult.errors.length + crossResult.errors.length;
  const totalWarnings = schemaResult.warnings.length + crossResult.warnings.length;

  if (totalErrors === 0 && totalWarnings === 0) {
    channel.appendLine('✓ Domain is valid.');
    vscode.window.showInformationMessage('KDNA: Domain is valid.');
  } else if (totalErrors === 0) {
    channel.appendLine(`✓ Domain valid with ${totalWarnings} warning(s).`);
    vscode.window.showWarningMessage(`KDNA: Domain valid with ${totalWarnings} warning(s).`);
  } else {
    channel.appendLine(`✗ ${totalErrors} error(s), ${totalWarnings} warning(s).`);
    vscode.window.showErrorMessage(`KDNA: ${totalErrors} validation error(s). See Output panel.`);
  }
  channel.show();
}

// ─── Pack ────────────────────────────────────────────────────────────

async function cmdPack(domainUri?: vscode.Uri) {
  if (!domainUri) domainUri = (await pickDomainDir()) || undefined;
  if (!domainUri) return;

  const info = await getDomainInfo(domainUri);
  const name = info?.name || domainUri.path.split('/').pop() || 'domain';
  const outputUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(domainUri, `../${name}.kdna`),
    filters: { 'KDNA Asset': ['kdna'] },
  });
  if (!outputUri) return;

  const zip = new (JSZip as any)();
  const entries = await vscode.workspace.fs.readDirectory(domainUri);

  for (const [entryName, type] of entries) {
    if (type !== vscode.FileType.File) continue;
    if (!entryName.endsWith('.json')) continue;
    const fileUri = vscode.Uri.joinPath(domainUri, entryName);
    const content = await vscode.workspace.fs.readFile(fileUri);
    zip.file(entryName, content);
  }

  const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
  await vscode.workspace.fs.writeFile(outputUri, zipBuffer);
  vscode.window.showWarningMessage(
    `KDNA: Bundled dev source to ${outputUri.fsPath}. This is an experimental authoring bundle; use KDNA Studio export for publishable .kdna files.`,
  );
}

// ─── Unpack ──────────────────────────────────────────────────────────

async function cmdUnpack(kdnaUri?: vscode.Uri) {
  if (!kdnaUri) kdnaUri = (await pickKdnaFile()) || undefined;
  if (!kdnaUri) return;

  const info = await getDomainInfo(vscode.Uri.joinPath(kdnaUri, '..'));
  const defaultName = kdnaUri.path.split('/').pop()?.replace('.kdna', '') || 'domain';

  const targetUris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select destination folder',
  });
  if (!targetUris?.length) return;

  const outputDir = vscode.Uri.joinPath(targetUris[0], defaultName);

  const content = await vscode.workspace.fs.readFile(kdnaUri);
  const zip = await JSZip.loadAsync(content);

  await vscode.workspace.fs.createDirectory(outputDir);

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const fileContent = await file.async('uint8array');
    const fileUri = vscode.Uri.joinPath(outputDir, filename);
    await vscode.workspace.fs.writeFile(fileUri, fileContent);
  }

  vscode.window.showInformationMessage(`KDNA: Unpacked to ${outputDir.fsPath}`);
}

// ─── Preview ─────────────────────────────────────────────────────────

async function cmdPreview(uri?: vscode.Uri) {
  if (!uri) {
    const choice = await pickDomainOrKdna();
    if (!choice) return;
    uri = choice;
  }

  if (isKdnaPackageFile(uri)) {
    PreviewPanel.createOrShow(uri, true);
  } else {
    const domainDir = (await isKdnaDomainDir(uri)) ? uri : await findDomainDir(uri);
    if (!domainDir) {
      vscode.window.showErrorMessage('Not a KDNA dev source workspace.');
      return;
    }
    PreviewPanel.createOrShow(domainDir, false);
  }
}

// ─── Install ─────────────────────────────────────────────────────────

async function cmdInstall() {
  const channel = getOutputChannel();
  channel.clear();
  channel.appendLine('KDNA: Fetching registry...');

  try {
    const https = require('https');
    const registryUrl = 'https://raw.githubusercontent.com/aikdna/kdna-registry/main/domains.json';

    const domains = await new Promise<any[]>((resolve, reject) => {
      https
        .get(registryUrl, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.domains) ? parsed.domains : [];
              resolve(list);
            } catch {
              reject(new Error('Invalid registry response'));
            }
          });
        })
        .on('error', reject);
    });

    if (!domains.length) {
      channel.appendLine('No domains found in registry.');
      channel.show();
      return;
    }

    const items = domains.map((d: any) => ({
      label: d.id || d.name,
      description: d.version ? `v${d.version}` : '',
      detail: d.description || '',
      domain: d,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a domain to install',
      matchOnDescription: true,
    });
    if (!picked) return;

    channel.appendLine(`Installing ${picked.label}...`);

    const homeKdna = vscode.Uri.joinPath(
      vscode.Uri.file(process.env.HOME || process.env.USERPROFILE || '.'),
      '.kdna',
      'domains',
      picked.label,
    );

    const downloadUrl = picked.domain.download_url || picked.domain.url;
    if (!downloadUrl) {
      channel.appendLine('Error: No download URL for this domain.');
      channel.show();
      return;
    }

    await vscode.workspace.fs.createDirectory(homeKdna);

    // Download and unpack
    const buffer = await new Promise<Uint8Array>((resolve, reject) => {
      https
        .get(downloadUrl, (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    });

    const zip = await JSZip.loadAsync(buffer);
    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const content = await file.async('uint8array');
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(homeKdna, filename), content);
    }

    channel.appendLine(`✓ Installed ${picked.label} to ${homeKdna.fsPath}`);
    vscode.window.showInformationMessage(`KDNA: Installed ${picked.label}`);
  } catch (err: any) {
    channel.appendLine(`Error: ${err.message}`);
    vscode.window.showErrorMessage(`KDNA: Install failed — ${err.message}`);
  }
  channel.show();
}

// ─── Create ──────────────────────────────────────────────────────────

async function cmdCreate() {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter the domain name (snake_case, e.g. my_domain)',
    placeHolder: 'my_domain',
    validateInput: (value) =>
      /^[a-z][a-z0-9_]*$/.test(value) ? null : 'Use lowercase letters, digits, and underscores.',
  });
  if (!name) return;

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const defaultUri = workspaceFolders?.[0]?.uri || vscode.Uri.file(process.cwd());

  const targetUris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri,
    title: 'Select parent directory for new dev source workspace',
  });
  if (!targetUris?.length) return;

  const domainDir = vscode.Uri.joinPath(targetUris[0], name);

  const today = new Date().toISOString().slice(0, 10);

  const manifest = {
    format: 'kdna',
    format_version: '1.0',
    spec_version: '1.0-rc',
    name,
    version: '0.1.0',
    languages: ['en'],
    default_language: 'en',
    created: today,
    updated: today,
    description: 'One-sentence description of what judgment this domain improves.',
    keywords: [],
    access: 'open',
    author: { name: 'Your Name', id: 'your-id' },
    license: {
      type: 'CC-BY-4.0',
      commercial: false,
      allow_agent_use: true,
      allow_redistribution: true,
      allow_training: true,
    },
    status: 'experimental',
    quality_badge: 'untested',
    authoring: {
      created_by: 'manual-dev-source',
      authoring_tool: 'kdna-vscode',
      human_lock_required: true,
      human_lock_count: 0,
      ai_assisted: false,
      human_confirmed: false,
    },
    registry: { repo: 'https://github.com/your-org/your-repo' },
    file_count: 2,
    files: ['KDNA_Core.json', 'KDNA_Patterns.json'],
  };

  const core = {
    meta: {
      version: '0.4',
      domain: name,
      created: today,
      purpose: 'Define the core cognition of this domain.',
      load_condition: 'Always load when this domain is selected.',
    },
    axioms: [
      {
        id: 'AX-001',
        one_sentence: 'One core judgment principle.',
        full_statement: 'A testable, domain-specific principle.',
        why: 'What the agent would get wrong WITHOUT this axiom.',
      },
    ],
    ontology: [
      {
        id: 'CON-001',
        one_sentence: 'Name one central concept the agent must distinguish.',
        essence: 'Operational meaning in this domain.',
        boundary: 'What this concept is NOT.',
        trigger_signal: 'Words or patterns that signal this concept is relevant.',
      },
    ],
    frameworks: [
      {
        id: 'FW-001',
        name: 'Example Framework',
        when_to_use: 'Specific condition where this framework applies.',
        steps: ['Step 1', 'Step 2', 'Step 3'],
      },
    ],
    core_structure: [
      { from: 'Surface symptom', to: 'Correct judgment', via: 'Cognitive shift' },
    ],
    stances: ['Default position the agent should bias toward.', 'Position the agent should argue against.'],
  };

  const patterns = {
    meta: {
      version: '0.4',
      domain: name,
      created: today,
      purpose: 'Define terminology, misunderstandings, and self-checks.',
      load_condition: 'Always load when this domain is selected.',
    },
    terminology: {
      standard_terms: [{ term: 'preferred term', definition: 'Operational definition.' }],
      banned_terms: [
        {
          term: 'term to avoid',
          why: 'Why this term misleads agent judgment.',
          replace_with: 'A concrete replacement.',
        },
      ],
    },
    misunderstandings: [
      {
        id: 'MS-001',
        wrong: 'Common wrong interpretation.',
        correct: 'Correct interpretation.',
        key_distinction: 'The boundary the agent must preserve.',
        why: 'What bad judgment results from the wrong interpretation.',
      },
    ],
    self_check: [
      'Did the answer apply the domain\'s core distinction?',
      'Would a domain expert agree with this judgment?',
    ],
  };

  await vscode.workspace.fs.createDirectory(domainDir);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(domainDir, 'kdna.json'),
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
  );
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(domainDir, 'KDNA_Core.json'),
    Buffer.from(JSON.stringify(core, null, 2) + '\n'),
  );
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(domainDir, 'KDNA_Patterns.json'),
    Buffer.from(JSON.stringify(patterns, null, 2) + '\n'),
  );

  // Open the manifest
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(domainDir, 'kdna.json'));
  await vscode.window.showTextDocument(doc);
  vscode.window.showInformationMessage(
    `KDNA: Created non-canonical dev source workspace "${name}". Use KDNA Studio export to create publishable .kdna files.`,
  );
}

// ─── Register All ────────────────────────────────────────────────────

export function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.VALIDATE, cmdValidate),
    vscode.commands.registerCommand(COMMANDS.PACK, cmdPack),
    vscode.commands.registerCommand(COMMANDS.UNPACK, cmdUnpack),
    vscode.commands.registerCommand(COMMANDS.PREVIEW, cmdPreview),
    vscode.commands.registerCommand(COMMANDS.INSTALL, cmdInstall),
    vscode.commands.registerCommand(COMMANDS.CREATE, cmdCreate),
  );
}
