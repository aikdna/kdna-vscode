/**
 * Bridge between @aikdna/kdna-core and VS Code's workspace filesystem.
 *
 * Uses kdna-core's data-first API: pre-read files via vscode.workspace.fs,
 * then pass parsed objects to kdna-core functions.
 */

import * as vscode from 'vscode';
import * as kdnaCore from '@aikdna/kdna-core';
import { readDomainData, readJsonFile } from './kdnaFiles';

/**
 * Load a KDNA domain from a workspace URI using kdna-core's data-first API.
 */
export async function loadDomainFromUri(
  domainDir: vscode.Uri,
  options?: { input?: string; mode?: 'all' | 'minimum' | 'auto' },
): Promise<kdnaCore.LoadedDomain | null> {
  const dataMap = await readDomainData(domainDir);
  return kdnaCore.loadDomainFromFiles(dataMap as any, options);
}

/**
 * Load a KDNA domain from a .kdna ZIP file.
 */
export async function loadDomainFromKdnaFile(
  kdnaUri: vscode.Uri,
): Promise<{ domain: kdnaCore.LoadedDomain | null; manifest: any }> {
  const JSZip = await import('jszip');
  const content = await vscode.workspace.fs.readFile(kdnaUri);
  const zip = await JSZip.loadAsync(content);

  const dataMap: Record<string, any> = {};
  const manifest = await readZipJson(zip, 'kdna.json');

  for (const [, filename] of Object.entries(kdnaCore.FILE_MAP as Record<string, string>)) {
    const data = await readZipJson(zip, filename);
    if (data) dataMap[filename] = data;
  }

  return {
    domain: kdnaCore.loadDomainFromFiles(dataMap as any),
    manifest,
  };
}

async function readZipJson(zip: any, filename: string): Promise<any> {
  const file = zip.file(filename);
  if (!file) return null;
  try {
    const text = await file.async('string');
    return JSON.parse(text);
  } catch {
    console.warn(`[kdna] ZIP entry ${filename} is corrupted — skipping`);
    vscode.window.showWarningMessage(`KDNA: ZIP entry "${filename}" is corrupted — file skipped. The .kdna dev package may be damaged.`);
    return null;
  }
}

/**
 * Lint a domain directory using kdna-core.
 */
export async function lintDomainDir(domainDir: vscode.Uri): Promise<kdnaCore.LintResult> {
  const dataMap = await readDomainData(domainDir);
  return kdnaCore.lintDomain(dataMap as any);
}

/**
 * Validate a domain directory with JSON Schema using kdna-core.
 */
export async function validateDomainDir(
  domainDir: vscode.Uri,
): Promise<{ schemaResult: kdnaCore.ValidationResult; crossResult: kdnaCore.ValidationResult }> {
  const dataMap = await readDomainData(domainDir);

  // Load schemas
  const schemaMap: Record<string, any> = {};
  const schemaDir = getSchemaDir();
  for (const schemaFile of [
    'KDNA_Core.schema.json',
    'KDNA_Patterns.schema.json',
    'KDNA_Scenarios.schema.json',
    'KDNA_Cases.schema.json',
    'KDNA_Reasoning.schema.json',
    'KDNA_Evolution.schema.json',
  ]) {
    try {
      const uri = vscode.Uri.file(`${schemaDir}/${schemaFile}`);
      const schema = await readJsonFile(uri);
      if (schema) schemaMap[schemaFile] = schema;
    } catch {
      // Schema not available
    }
  }

  const schemaResult = kdnaCore.validateDomainSchema(dataMap as any, schemaMap);
  const crossResult = kdnaCore.validateCrossFile(dataMap as any);

  return { schemaResult, crossResult };
}

/**
 * Get the path to the JSON Schema directory bundled with kdna-core.
 */
function getSchemaDir(): string {
  // In the bundled extension, schemas are in node_modules/@aikdna/kdna-core/schema/
  const path = require('path');
  try {
    return path.join(
      path.dirname(require.resolve('@aikdna/kdna-core/package.json')),
      'schema',
    );
  } catch {
    return '';
  }
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
  const { domain, manifest } = await loadDomainFromKdnaFile(kdnaUri);
  if (!domain) return '<!DOCTYPE html><html><body><p>No domain data</p></body></html>';

  return kdnaCore.renderPreviewHTML(domain, manifest);
}
