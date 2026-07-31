'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('current-surface policy rejects obsolete creation and false completion claims', async () => {
  const { auditCurrentSurface } = await import(
    '../scripts/public-current-surface-policy.mjs'
  );
  const command = ['kdna', 'create'].join('.');
  const badge = ['quality', 'badge'].join('_');
  const safe = {
    packageManifest: {
      activationEvents: [],
      contributes: {
        commands: [
          { command: 'kdna.validate', title: 'Validate (Technical)' },
          { command: 'kdna.pack', title: 'Pack (Not Creation Complete)' },
          { command: 'kdna.preview', title: 'Preview (Technical)' },
        ],
        viewsWelcome: [],
      },
    },
    commandSource: 'export function registerCommands() {}',
    previewSource: 'Technical preview only',
    readme:
      'The extension does not invoke it or generate a replacement manifest; ' +
      'they do not run the Studio creation gates.',
    vscodeIgnore: 'templates/\n',
    templateFiles: ['kdna.json'],
    templateContents: {
      'kdna.json': {
        _status: 'RETIRED_NOT_A_TEMPLATE',
        _packaged: false,
      },
    },
    manifestSchema: { properties: { [badge]: false } },
  };
  assert.deepEqual(auditCurrentSurface(safe), []);

  const hostileCases = [
    {
      ...safe,
      packageManifest: {
        ...safe.packageManifest,
        activationEvents: [`onCommand:${command}`],
      },
    },
    {
      ...safe,
      commandSource: `async function ${['cmd', 'Create'].join('')}() { return { ${badge}: 'untested' }; }`,
    },
    {
      ...safe,
      templateContents: {
        'kdna.json': {
          access: 'open',
          [badge]: 'untested',
        },
      },
    },
    {
      ...safe,
      packageManifest: {
        activationEvents: [],
        contributes: {
          commands: [
            { command: 'kdna.validate', title: 'Validate' },
            { command: 'kdna.pack', title: 'Pack canonical asset' },
            { command: 'kdna.preview', title: 'Preview' },
          ],
          viewsWelcome: [],
        },
      },
    },
  ];
  for (const hostile of hostileCases) {
    assert.notDeepEqual(auditCurrentSurface(hostile), []);
  }
});
