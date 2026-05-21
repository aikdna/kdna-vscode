/**
 * kdna-core bridge tests.
 * Test the integration with @aikdna/kdna-core in VS Code context.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as kdnaCore from '@aikdna/kdna-core';

suite('kdna-core Integration', () => {
  test('kdna-core module should be loadable', () => {
    assert.ok(kdnaCore, 'kdna-core should be importable');
    assert.ok(typeof kdnaCore.FILE_MAP === 'object', 'FILE_MAP should be an object');
    assert.ok(typeof kdnaCore.loadCorePatternsFromData === 'function', 'loadCorePatternsFromData should be a function');
    assert.ok(typeof kdnaCore.loadDomainFromData === 'function', 'loadDomainFromData should be a function');
    assert.ok(typeof kdnaCore.loadDomainFromFiles === 'function', 'loadDomainFromFiles should be a function');
    assert.ok(typeof kdnaCore.classifyInput === 'function', 'classifyInput should be a function');
    assert.ok(typeof kdnaCore.formatContext === 'function', 'formatContext should be a function');
    assert.ok(typeof kdnaCore.lintDomain === 'function', 'lintDomain should be a function');
    assert.ok(typeof kdnaCore.validateDomainSchema === 'function', 'validateDomainSchema should be a function');
    assert.ok(typeof kdnaCore.validateCrossFile === 'function', 'validateCrossFile should be a function');
    assert.ok(typeof kdnaCore.renderPreviewHTML === 'function', 'renderPreviewHTML should be a function');
  });

  test('loadCorePatternsFromData should work with valid data', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
      axioms: [],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: [],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: [],
    };

    const result = kdnaCore.loadCorePatternsFromData(coreData, patternsData);
    assert.ok(result, 'Should return non-null');
    assert.strictEqual(result.core, coreData);
    assert.strictEqual(result.patterns, patternsData);
  });

  test('loadCorePatternsFromData should return null with invalid data', () => {
    assert.strictEqual(kdnaCore.loadCorePatternsFromData(null as any, null as any), null);
    assert.strictEqual(kdnaCore.loadCorePatternsFromData({} as any, null as any), null);
  });

  test('classifyInput should detect scenario signals', () => {
    const result = kdnaCore.classifyInput('describe a situation where...');
    assert.ok(result.includes('scenarios'), 'Should detect scenario signal');
  });

  test('classifyInput should detect reasoning signals', () => {
    const result = kdnaCore.classifyInput('explain why this happened');
    assert.ok(result.includes('reasoning'), 'Should detect reasoning signal');
  });

  test('classifyInput should return empty for neutral input', () => {
    const result = kdnaCore.classifyInput('hello world');
    assert.strictEqual(result.length, 0, 'Should return empty array');
  });

  test('formatContext should produce non-empty string', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test-domain', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
      axioms: [{ id: 'AX-001', one_sentence: 'Test axiom', full_statement: 'Full test', why: 'Because' }],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: ['Test stance'],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test-domain', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: ['Check 1'],
    };

    const domain = kdnaCore.loadDomainFromData({ core: coreData, patterns: patternsData });
    assert.ok(domain, 'Domain should load');

    const ctx = kdnaCore.formatContext(domain!);
    assert.ok(ctx.length > 0, 'Context should be non-empty');
    assert.ok(ctx.includes('test-domain'), 'Context should include domain name');
    assert.ok(ctx.includes('Test axiom'), 'Context should include axiom');
  });

  test('lintDomain should detect missing required fields', () => {
    const result = kdnaCore.lintDomain({} as any);
    assert.ok(result.errors.length > 0, 'Should have errors for empty data');
    assert.ok(result.errors.some((e: string) => e.includes('Missing required file')), 'Should report missing files');
  });

  test('lintDomain should pass valid minimal domain', () => {
    const dataMap: Record<string, any> = {
      'KDNA_Core.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
        axioms: [{ id: 'AX-001', one_sentence: 'Test', full_statement: 'Full test', why: 'Because' }],
        ontology: [{ id: 'CON-001', one_sentence: 'Concept', essence: 'Meaning', boundary: 'Not X', trigger_signal: 'signal' }],
        frameworks: [{ id: 'FW-001', name: 'Framework', when_to_use: 'Always', steps: ['Step 1'] }],
        core_structure: [],
        stances: [],
      },
      'KDNA_Patterns.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
        terminology: { standard_terms: [], banned_terms: [] },
        misunderstandings: [],
        self_check: ['Did it work?'],
      },
    };

    const result = kdnaCore.lintDomain(dataMap as any);
    assert.ok(result.errors.length === 0, `Should have no errors, got: ${result.errors.join(', ')}`);
  });

  test('validateCrossFile should detect domain name mismatch', () => {
    const dataMap: Record<string, any> = {
      'KDNA_Core.json': { meta: { domain: 'domain-a', version: '0.4' } },
      'KDNA_Patterns.json': { meta: { domain: 'domain-b', version: '0.4' } },
    };

    const result = kdnaCore.validateCrossFile(dataMap as any);
    assert.ok(result.errors.length > 0, 'Should detect domain name mismatch');
    assert.ok(result.errors[0].includes('domain-b'), 'Error should mention mismatched domain');
  });

  test('validateCrossFile should detect version mismatch', () => {
    const dataMap: Record<string, any> = {
      'KDNA_Core.json': { meta: { domain: 'test', version: '0.4' } },
      'KDNA_Patterns.json': { meta: { domain: 'test', version: '0.5' } },
    };

    const result = kdnaCore.validateCrossFile(dataMap as any);
    assert.ok(result.warnings.length > 0, 'Should warn about version mismatch');
  });

  test('renderPreviewHTML should produce valid HTML', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
      axioms: [{ id: 'AX-001', one_sentence: 'Test axiom', full_statement: 'Full', why: 'Because' }],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: [],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 'test', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: [],
    };

    const domain = kdnaCore.loadDomainFromData({ core: coreData, patterns: patternsData });
    const html = kdnaCore.renderPreviewHTML(domain!);
    assert.ok(html.includes('<!DOCTYPE html>'), 'Should be valid HTML document');
    assert.ok(html.includes('<title>'), 'Should have title tag');
    assert.ok(html.includes('Test axiom'), 'Should include axiom content');
    assert.ok(html.includes('</html>'), 'Should close html tag');
  });

  test('renderPreviewHTML should handle null domain gracefully', () => {
    const html = kdnaCore.renderPreviewHTML(null as any);
    assert.ok(html.includes('No domain data'), 'Should show error message');
  });

  test('escHtml should escape special characters', () => {
    assert.strictEqual(kdnaCore.escHtml('<script>'), '&lt;script&gt;');
    assert.strictEqual(kdnaCore.escHtml('"test"'), '&quot;test&quot;');
    assert.strictEqual(kdnaCore.escHtml('a & b'), 'a &amp; b');
  });
});
