/**
 * Command registry — registers all KDNA extension commands.
 */

import * as vscode from 'vscode';
import * as kdnaCore from '@aikdna/kdna-core';
import { COMMANDS } from '../../constants';
import {
  findDomainDirs,
  findDomainDir,
  isKdnaPackageFile,
  isKdnaDomainDir,
  isKdnaFile,
  getDomainInfo,
  pickLocalKdnaFile,
} from '../../utils/kdnaFiles';
import { validateDomainDir } from '../../utils/kdnaLoader';
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
  return pickLocalKdnaFile({ title: 'Select .kdna file' });
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
    channel.appendLine('✓ Project view passes current technical checks. This is not Creation Complete.');
    vscode.window.showInformationMessage(
      'KDNA: Project view passes current technical checks; Creation gates have not run.',
    );
  } else if (totalErrors === 0) {
    channel.appendLine(
      `✓ Project view passes technical checks with ${totalWarnings} warning(s). This is not Creation Complete.`,
    );
    vscode.window.showWarningMessage(
      `KDNA: Project view has ${totalWarnings} technical warning(s); Creation gates have not run.`,
    );
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

  if (domainUri.scheme !== 'file' || outputUri.scheme !== 'file') {
    vscode.window.showErrorMessage('KDNA: Core packing currently requires local filesystem paths.');
    return;
  }
  try {
    kdnaCore.pack(domainUri.fsPath, outputUri.fsPath);
    vscode.window.showInformationMessage(
      `KDNA: Created a technical package at ${outputUri.fsPath}. This is not Creation Complete or a reviewed Studio export.`,
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `KDNA: Core rejected this project view — ${error.message}. Use KDNA Studio export for authoring projects.`,
    );
  }
}

// ─── Unpack ──────────────────────────────────────────────────────────

async function cmdUnpack(kdnaUri?: vscode.Uri) {
  if (!kdnaUri) kdnaUri = (await pickKdnaFile()) || undefined;
  if (!kdnaUri) return;

  const defaultName = kdnaUri.path.split('/').pop()?.replace('.kdna', '') || 'domain';

  const targetUris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select destination folder',
  });
  if (!targetUris?.length) return;

  const outputDir = vscode.Uri.joinPath(targetUris[0], defaultName);

  if (kdnaUri.scheme !== 'file' || outputDir.scheme !== 'file') {
    vscode.window.showErrorMessage('KDNA: Core unpacking currently requires local filesystem paths.');
    return;
  }
  try {
    kdnaCore.unpack(kdnaUri.fsPath, outputDir.fsPath);
    vscode.window.showInformationMessage(`KDNA: Unpacked through Core to ${outputDir.fsPath}`);
  } catch (error: any) {
    vscode.window.showErrorMessage(`KDNA: Core rejected this asset — ${error.message}`);
  }
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
      vscode.window.showErrorMessage('Not an expanded KDNA project view.');
      return;
    }
    PreviewPanel.createOrShow(domainDir, false);
  }
}

// ─── Open Local Asset ────────────────────────────────────────────────

async function cmdInstall() {
  const channel = getOutputChannel();
  channel.clear();

  const kdnaUri = await pickKdnaFile();
  if (!kdnaUri) return;

  try {
    channel.appendLine(`KDNA: Opening local asset ${kdnaUri.fsPath}`);
    PreviewPanel.createOrShow(kdnaUri, true);
    vscode.window.showInformationMessage('KDNA: Opened local .kdna asset preview.');
  } catch (err: any) {
    channel.appendLine(`Error: ${err.message}`);
    vscode.window.showErrorMessage(`KDNA: Could not open local .kdna asset — ${err.message}`);
  }
  channel.show();
}

// ─── Register All ────────────────────────────────────────────────────

export function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.VALIDATE, cmdValidate),
    vscode.commands.registerCommand(COMMANDS.PACK, cmdPack),
    vscode.commands.registerCommand(COMMANDS.UNPACK, cmdUnpack),
    vscode.commands.registerCommand(COMMANDS.PREVIEW, cmdPreview),
    vscode.commands.registerCommand(COMMANDS.INSTALL, cmdInstall),
  );
}
