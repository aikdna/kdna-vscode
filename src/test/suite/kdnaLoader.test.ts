/**
 * kdnaLoader bridge tests.
 * Test loading domains through the VS Code filesystem bridge.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as kdnaCore from '@aikdna/kdna-core';
import { diagnoseProjectViewData } from '../../utils/projectViewDiagnostics';

suite('Domain Loader Bridge', () => {
  let tmpDir: vscode.Uri;

  suiteSetup(async () => {
    // Create a temporary domain for testing
    tmpDir = vscode.Uri.file(
      path.join(require('os').tmpdir(), `kdna-test-${Date.now()}`),
    );
    await vscode.workspace.fs.createDirectory(tmpDir);

    const manifest = {
      kdna_spec: '0.4',
      name: 'test_domain',
      version: '0.1.0',
      status: 'experimental',
      description: 'Test domain for unit tests',
    };

    const core = {
      meta: { version: '0.4', domain: 'test_domain', created: '2024-01-01', purpose: 'Test', load_condition: 'always' },
      axioms: [{ id: 'AX-001', one_sentence: 'Test axiom', full_statement: 'Full test', why: 'Because' }],
      ontology: [{ id: 'CON-001', one_sentence: 'Test concept', essence: 'Meaning', boundary: 'Not X', trigger_signal: 'test' }],
      frameworks: [{ id: 'FW-001', name: 'Test FW', when_to_use: 'Always', steps: ['Step 1'] }],
      core_structure: [],
      stances: ['Test stance'],
    };

    const patterns = {
      meta: { version: '0.4', domain: 'test_domain', created: '2024-01-01', purpose: 'Test', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [{ term: 'badword', why: 'misleads', replace_with: 'goodword' }] },
      misunderstandings: [],
      self_check: ['Did it work?'],
    };

    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(tmpDir, 'kdna.json'),
      Buffer.from(JSON.stringify(manifest, null, 2)),
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(tmpDir, 'KDNA_Core.json'),
      Buffer.from(JSON.stringify(core, null, 2)),
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(tmpDir, 'KDNA_Patterns.json'),
      Buffer.from(JSON.stringify(patterns, null, 2)),
    );
  });

  suiteTeardown(async () => {
    try {
      await vscode.workspace.fs.delete(tmpDir, { recursive: true });
    } catch {
      // cleanup failure is ok
    }
  });

  test('should read domain data from filesystem', async () => {
    const coreUri = vscode.Uri.joinPath(tmpDir, 'KDNA_Core.json');
    const content = await vscode.workspace.fs.readFile(coreUri);
    const data = JSON.parse(new TextDecoder().decode(content));
    assert.strictEqual(data.meta.domain, 'test_domain');
    assert.strictEqual(data.axioms.length, 1);
  });

  test('should load domain via kdna-core loadDomainFromFiles', async () => {
    const dataMap: Record<string, any> = {};

    for (const filename of ['KDNA_Core.json', 'KDNA_Patterns.json', 'kdna.json']) {
      const uri = vscode.Uri.joinPath(tmpDir, filename);
      const content = await vscode.workspace.fs.readFile(uri);
      dataMap[filename] = JSON.parse(new TextDecoder().decode(content));
    }

    const domain = kdnaCore.loadDomainFromFiles(dataMap as any, { mode: 'all' });
    assert.ok(domain, 'Domain should load successfully');
    assert.strictEqual(domain!.core.meta.domain, 'test_domain');
  });

  test('should lint domain without errors', () => {
    // Create inline dataMap matching our test domain
    const testMap = {
      'KDNA_Core.json': {
        meta: { version: '0.4', domain: 'test_domain', created: '2024-01-01', purpose: 'Test', load_condition: 'always' },
        axioms: [{ id: 'AX-001', one_sentence: 'Test axiom', full_statement: 'Full test', why: 'Because' }],
        ontology: [{ id: 'CON-001', one_sentence: 'Test concept', essence: 'Meaning', boundary: 'Not X', trigger_signal: 'test' }],
        frameworks: [{ id: 'FW-001', name: 'Test FW', when_to_use: 'Always', steps: ['Step 1'] }],
        core_structure: [],
        stances: ['Test stance'],
      },
      'KDNA_Patterns.json': {
        meta: { version: '0.4', domain: 'test_domain', created: '2024-01-01', purpose: 'Test', load_condition: 'always' },
        terminology: { standard_terms: [], banned_terms: [] },
        misunderstandings: [],
        self_check: ['Did it work?'],
      },
    };

    const result = diagnoseProjectViewData(testMap);
    assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors.join('; ')}`);
  });

  test('should render preview HTML for domain', () => {
    const dataMap: Record<string, any> = {
      'KDNA_Core.json': {
        meta: { version: '0.4', domain: 'test_domain', created: '2024-01-01', purpose: 'Test', load_condition: 'always' },
        axioms: [{ id: 'AX-001', one_sentence: 'Test axiom', full_statement: 'Full test', why: 'Because' }],
        ontology: [],
        frameworks: [],
        core_structure: [],
        stances: [],
      },
      'KDNA_Patterns.json': {
        meta: { version: '0.4', domain: 'test_domain', created: '2024-01-01', purpose: 'Test', load_condition: 'always' },
        terminology: { standard_terms: [], banned_terms: [] },
        misunderstandings: [],
        self_check: [],
      },
    };

    const domain = kdnaCore.loadDomainFromFiles(dataMap as any, { mode: 'all' });
    assert.ok(domain, 'Should load domain');

    const manifest = { name: 'test_domain', version: '0.1.0', status: 'experimental', description: 'Test' };
    const html = kdnaCore.renderPreviewHTML(domain!, manifest as any);
    assert.ok(html.includes('test_domain'), 'Should include domain name');
    assert.ok(html.includes('Test axiom'), 'Should include axiom');
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'Should be valid HTML');
  });

  test('should detect a directory with kdna.json as domain', async () => {
    const entries = await vscode.workspace.fs.readDirectory(tmpDir);
    const names = entries.map((e) => e[0]);
    assert.ok(names.includes('kdna.json'), 'Should have kdna.json');
    assert.ok(names.some((n) => n.startsWith('KDNA_') && n.endsWith('.json')), 'Should have KDNA files');
  });
});
