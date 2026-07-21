/**
 * Bridge between @aikdna/kdna-core and VS Code's workspace filesystem.
 *
 * Uses kdna-core's data-first API: pre-read files via vscode.workspace.fs,
 * then pass parsed objects to kdna-core functions.
 */

import * as vscode from 'vscode';
import * as kdnaCore from '@aikdna/kdna-core';
import { readDomainData, readJsonFile } from './kdnaFiles';
import { loadRuntimeAsset, renderRuntimeAssetPreview } from './runtimeAsset';
import { diagnoseProjectViewData, ProjectViewDiagnostics } from './projectViewDiagnostics';

/**
 * Load an expanded KDNA project view using kdna-core's data-first API.
 */
export async function loadDomainFromUri(
  domainDir: vscode.Uri,
  options?: { input?: string; mode?: 'all' | 'minimum' | 'auto' },
): Promise<kdnaCore.LoadedDomain | null> {
  const dataMap = await readDomainData(domainDir);
  return kdnaCore.loadDomainFromFiles(dataMap as any, options);
}

/**
 * Load a KDNA domain from a .kdna asset file.
 */
export async function loadRuntimeAssetFromKdnaFile(
  kdnaUri: vscode.Uri,
){
  const content = await vscode.workspace.fs.readFile(kdnaUri);
  return loadRuntimeAsset(content);
}

/**
 * Lint an expanded KDNA project view using kdna-core.
 */
export async function lintDomainDir(domainDir: vscode.Uri): Promise<ProjectViewDiagnostics> {
  const dataMap = await readDomainData(domainDir);
  const structural = diagnoseProjectViewData(dataMap as any);
  const cross = kdnaCore.validateCrossFile(dataMap as any);
  return {
    valid: structural.valid && cross.valid,
    errors: [...structural.errors, ...cross.errors],
    warnings: [...structural.warnings, ...cross.warnings],
  };
}

/**
 * Validate an expanded KDNA project view with JSON Schema using kdna-core.
 */
export async function validateDomainDir(
  domainDir: vscode.Uri,
): Promise<{ schemaResult: kdnaCore.ValidationResult; crossResult: kdnaCore.ValidationResult }> {
  const dataMap = await readDomainData(domainDir);
  const schemaResult = diagnoseProjectViewData(dataMap as any);
  const crossResult = kdnaCore.validateCrossFile(dataMap as any);

  return { schemaResult, crossResult };
}

/**
 * Render domain preview HTML using kdna-core.
 */
export async function renderDomainPreview(
  domainDir: vscode.Uri,
): Promise<string> {
  const domain = await loadDomainFromUri(domainDir, { mode: 'all' });
  if (!domain) return '<!DOCTYPE html><html><body><p>No domain data</p></body></html>';

  const manifest = await readJsonFile(vscode.Uri.joinPath(domainDir, 'kdna.json'));
  return kdnaCore.renderPreviewHTML(domain, manifest);
}

/**
 * Render domain preview HTML from a .kdna file.
 */
export async function renderKdnaPreview(kdnaUri: vscode.Uri): Promise<string> {
  const result = await loadRuntimeAssetFromKdnaFile(kdnaUri);
  return renderRuntimeAssetPreview(result);
}
