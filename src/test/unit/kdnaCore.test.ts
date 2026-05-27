/**
 * Standalone unit tests for @aikdna/kdna-core pure functions.
 * No VS Code dependency — runs with plain Node `node --test`.
 *
 * These tests verify that the kdna-core library works correctly
 * independent of the VS Code extension context.
 */

import * as assert from 'node:assert';
import { describe, it } from 'node:test';

// Dynamic require since this is a CJS module and we're in ESM-ish context
const kdnaCore = require('@aikdna/kdna-core');

describe('kdna-core loader', () => {
  it('should export FILE_MAP', () => {
    assert.ok(kdnaCore.FILE_MAP);
    assert.strictEqual(kdnaCore.FILE_MAP.core, 'KDNA_Core.json');
    assert.strictEqual(kdnaCore.FILE_MAP.patterns, 'KDNA_Patterns.json');
    assert.strictEqual(kdnaCore.FILE_MAP.scenarios, 'KDNA_Scenarios.json');
  });

  it('should load core + patterns from data', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      axioms: [],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: [],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: [],
    };

    const result = kdnaCore.loadCorePatternsFromData(coreData, patternsData);
    assert.ok(result);
    assert.strictEqual(result.core, coreData);
    assert.strictEqual(result.patterns, patternsData);
  });

  it('should return null for null data', () => {
    assert.strictEqual(kdnaCore.loadCorePatternsFromData(null, null), null);
    assert.strictEqual(kdnaCore.loadCorePatternsFromData(null, {}), null);
  });

  it('should load domain from data map with minimum mode', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      axioms: [],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: [],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: [],
    };

    const domain = kdnaCore.loadDomainFromData(
      { core: coreData, patterns: patternsData },
      { mode: 'minimum' },
    );
    assert.ok(domain);
    assert.ok(domain.core);
    assert.ok(domain.patterns);
    assert.strictEqual(domain.scenarios, undefined);
  });

  it('should load domain from file-based data map', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      axioms: [],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: [],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: [],
    };

    const domain = kdnaCore.loadDomainFromFiles(
      { 'KDNA_Core.json': coreData, 'KDNA_Patterns.json': patternsData },
    );
    assert.ok(domain);
    assert.ok(domain.core);
  });
});

describe('kdna-core classifyInput', () => {
  it('should detect scenario signals in English', () => {
    const result = kdnaCore.classifyInput('describe a situation where...');
    assert.ok(result.includes('scenarios'));
  });

  it('should detect scenario signals in Chinese', () => {
    const result = kdnaCore.classifyInput('描述一下这个场景');
    assert.ok(result.includes('scenarios'));
  });

  it('should detect reasoning signals', () => {
    const result = kdnaCore.classifyInput('explain why this happened');
    assert.ok(result.includes('reasoning'));
  });

  it('should detect evolution signals', () => {
    const result = kdnaCore.classifyInput('let\'s measure our progress');
    assert.ok(result.includes('evolution'));
  });

  it('should detect case signals', () => {
    const result = kdnaCore.classifyInput('show me a full case study');
    assert.ok(result.includes('cases'));
  });

  it('should detect multiple signals', () => {
    const result = kdnaCore.classifyInput('describe a case and explain the logic behind it');
    assert.ok(result.includes('scenarios'));
    assert.ok(result.includes('cases'));
    assert.ok(result.includes('reasoning'));
  });

  it('should return empty for neutral input', () => {
    const result = kdnaCore.classifyInput('hello world');
    assert.strictEqual(result.length, 0);
  });

  it('should detect mixed Chinese-English signals', () => {
    const result = kdnaCore.classifyInput('explain 这个案例的 logic');
    assert.ok(result.includes('reasoning'));
    assert.ok(result.includes('cases'));
  });
});

describe('kdna-core formatContext', () => {
  const makeDomain = () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test-domain', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      axioms: [{ id: 'AX-001', one_sentence: 'Test axiom', full_statement: 'Full test axiom statement', why: 'Important reason' }],
      ontology: [{ id: 'CON-001', one_sentence: 'Test concept', essence: 'Meaning', boundary: 'Not X', trigger_signal: 'test' }],
      frameworks: [{ id: 'FW-001', name: 'Test FW', when_to_use: 'Always', steps: ['Step 1'] }],
      core_structure: [],
      stances: ['Be helpful', 'Avoid harm'],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test-domain', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [{ term: 'bad', why: 'vague', replace_with: 'specific' }] },
      misunderstandings: [{ id: 'MS-001', wrong: 'Wrong idea', correct: 'Right idea', key_distinction: 'The boundary', why: 'Bad judgment' }],
      self_check: ['Did it work?'],
    };
    return kdnaCore.loadDomainFromData({ core: coreData, patterns: patternsData });
  };

  it('should produce a non-empty context string', () => {
    const domain = makeDomain();
    const ctx = kdnaCore.formatContext(domain);
    assert.ok(ctx.length > 0);
  });

  it('should include domain name', () => {
    const domain = makeDomain();
    const ctx = kdnaCore.formatContext(domain);
    assert.ok(ctx.includes('test-domain'));
  });

  it('should include axioms', () => {
    const domain = makeDomain();
    const ctx = kdnaCore.formatContext(domain);
    assert.ok(ctx.includes('Test axiom'));
    assert.ok(ctx.includes('Important reason'));
  });

  it('should include stances', () => {
    const domain = makeDomain();
    const ctx = kdnaCore.formatContext(domain);
    assert.ok(ctx.includes('Be helpful'));
  });

  it('should include banned terms', () => {
    const domain = makeDomain();
    const ctx = kdnaCore.formatContext(domain);
    assert.ok(ctx.includes('bad'));
    assert.ok(ctx.includes('specific'));
  });

  it('should include self checks', () => {
    const domain = makeDomain();
    const ctx = kdnaCore.formatContext(domain);
    assert.ok(ctx.includes('Did it work?'));
  });

  it('should include misunderstandings', () => {
    const domain = makeDomain();
    const ctx = kdnaCore.formatContext(domain);
    assert.ok(ctx.includes('Wrong idea'));
    assert.ok(ctx.includes('Right idea'));
  });

  it('should return empty string for null domain', () => {
    assert.strictEqual(kdnaCore.formatContext(null), '');
  });
});

describe('kdna-core lintDomain', () => {
  it('should detect missing required files', () => {
    const result = kdnaCore.lintDomain({});
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some((e: string) => e.includes('Missing required file')));
  });

  it('should detect too many files', () => {
    const dataMap: Record<string, any> = {
      'KDNA_Core.json': {},
      'KDNA_Patterns.json': {},
      'KDNA_Scenarios.json': {},
      'KDNA_Cases.json': {},
      'KDNA_Reasoning.json': {},
      'KDNA_Evolution.json': {},
      'extra.json': {},
    };
    const result = kdnaCore.lintDomain(dataMap);
    assert.ok(result.errors.some((e: string) => e.includes('at most 6')));
  });

  it('should pass a valid minimal domain', () => {
    const dataMap = {
      'KDNA_Core.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
        axioms: [{ id: 'AX-001', one_sentence: 'Test', full_statement: 'Full', why: 'Because' }],
        ontology: [{ id: 'CON-001', one_sentence: 'Concept', essence: 'Meaning', boundary: 'Not X', trigger_signal: 'signal' }],
        frameworks: [{ id: 'FW-001', name: 'FW', when_to_use: 'Always', steps: ['Step'] }],
        core_structure: [],
        stances: [],
      },
      'KDNA_Patterns.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
        terminology: { standard_terms: [], banned_terms: [] },
        misunderstandings: [],
        self_check: ['Did it work?'],
      },
    };

    const result = kdnaCore.lintDomain(dataMap);
    assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors.join(', ')}`);
  });

  it('should detect missing required fields in axioms', () => {
    const dataMap = {
      'KDNA_Core.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
        axioms: [{ id: 'AX-001' }], // missing one_sentence, full_statement, why
        ontology: [],
        frameworks: [],
        core_structure: [],
        stances: [],
      },
      'KDNA_Patterns.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
        terminology: { standard_terms: [], banned_terms: [] },
        misunderstandings: [],
        self_check: [],
      },
    };

    const result = kdnaCore.lintDomain(dataMap);
    assert.ok(result.errors.length > 0, 'Should detect missing axiom fields');
    assert.ok(result.errors.some((e: string) => e.includes('one_sentence')));
  });

  it('should warn on non yes/no self_check items', () => {
    const dataMap = {
      'KDNA_Core.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
        axioms: [],
        ontology: [],
        frameworks: [],
        core_structure: [],
        stances: [],
      },
      'KDNA_Patterns.json': {
        meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
        terminology: { standard_terms: [], banned_terms: [] },
        misunderstandings: [],
        self_check: ['This is not a yes/no question because it asks what to do next?'],
      },
    };

    const result = kdnaCore.lintDomain(dataMap);
    // Should NOT warn because it ends with "?" (which is accepted)
    // Use a statement that doesn't start with a yes/no word
    const dataMap2 = {
      'KDNA_Core.json': dataMap['KDNA_Core.json'],
      'KDNA_Patterns.json': {
        ...dataMap['KDNA_Patterns.json'],
        self_check: ['Make sure the response is accurate and helpful'],
      },
    };

    const result2 = kdnaCore.lintDomain(dataMap2);
    assert.ok(result2.warnings.some((w: string) => w.includes('yes/no')), 'Should warn about non yes/no check');
  });
});

describe('kdna-core validateCrossFile', () => {
  it('should detect domain name mismatch', () => {
    const dataMap = {
      'KDNA_Core.json': { meta: { domain: 'domain-a', version: '0.4' } },
      'KDNA_Patterns.json': { meta: { domain: 'domain-b', version: '0.4' } },
    };
    const result = kdnaCore.validateCrossFile(dataMap);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('domain-b'));
  });

  it('should detect version mismatch as an error', () => {
    const dataMap = {
      'KDNA_Core.json': { meta: { domain: 'test', version: '0.4' } },
      'KDNA_Patterns.json': { meta: { domain: 'test', version: '0.5' } },
    };
    const result = kdnaCore.validateCrossFile(dataMap);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('version'));
  });

  it('should pass for consistent domain', () => {
    const dataMap = {
      'KDNA_Core.json': { meta: { domain: 'test', version: '0.4' } },
      'KDNA_Patterns.json': { meta: { domain: 'test', version: '0.4' } },
    };
    const result = kdnaCore.validateCrossFile(dataMap);
    assert.strictEqual(result.errors.length, 0);
  });
});

describe('kdna-core renderPreviewHTML', () => {
  it('should produce valid HTML document', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      axioms: [{ id: 'AX-001', one_sentence: 'Test axiom', full_statement: 'Full', why: 'Because' }],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: [],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: [],
    };

    const domain = kdnaCore.loadDomainFromData({ core: coreData, patterns: patternsData });
    const html = kdnaCore.renderPreviewHTML(domain);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<title>'));
    assert.ok(html.includes('Test axiom'));
    assert.ok(html.includes('</html>'));
  });

  it('should handle null domain', () => {
    const html = kdnaCore.renderPreviewHTML(null);
    assert.ok(html.includes('No domain data'));
  });

  it('should include manifest info when provided', () => {
    const coreData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      axioms: [],
      ontology: [],
      frameworks: [],
      core_structure: [],
      stances: [],
    };
    const patternsData = {
      meta: { version: '0.4', domain: 'test', created: '2024-01-01', purpose: 't', load_condition: 'always' },
      terminology: { standard_terms: [], banned_terms: [] },
      misunderstandings: [],
      self_check: [],
    };

    const domain = kdnaCore.loadDomainFromData({ core: coreData, patterns: patternsData });
    const manifest = {
      kdna_spec: '0.4',
      name: 'custom-name',
      version: '1.0.0',
      status: 'stable',
      access: 'open',
      language: 'en',
      author: { name: 'Test Author' },
      license: { type: 'CC-BY-4.0' },
      description: 'Custom description',
    };
    const html = kdnaCore.renderPreviewHTML(domain, manifest);
    assert.ok(html.includes('custom-name'));
    assert.ok(html.includes('1.0.0'));
    assert.ok(html.includes('stable'));
  });
});

describe('kdna-core escHtml', () => {
  it('should escape < and >', () => {
    assert.strictEqual(kdnaCore.escHtml('<script>'), '&lt;script&gt;');
  });

  it('should escape double quotes', () => {
    assert.strictEqual(kdnaCore.escHtml('"hello"'), '&quot;hello&quot;');
  });

  it('should escape ampersand', () => {
    assert.strictEqual(kdnaCore.escHtml('a & b'), 'a &amp; b');
  });

  it('should handle null/undefined', () => {
    assert.strictEqual(kdnaCore.escHtml(null), '');
    assert.strictEqual(kdnaCore.escHtml(undefined), '');
  });
});
