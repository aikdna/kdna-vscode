#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { auditCurrentSurface } from './public-current-surface-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const schemaPath = require.resolve('@aikdna/kdna-core/schema/manifest.schema.json');
const templatesPath = path.join(root, 'templates');
const templateFiles = fs.existsSync(templatesPath)
  ? fs.readdirSync(templatesPath).filter((name) => !name.startsWith('.')).sort()
  : [];
const findings = auditCurrentSurface({
  packageManifest: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
  commandSource: fs.readFileSync(
    path.join(root, 'src', 'features', 'commands', 'commandRegistry.ts'),
    'utf8',
  ),
  previewSource: fs.readFileSync(
    path.join(root, 'src', 'features', 'webview', 'previewPanel.ts'),
    'utf8',
  ),
  readme: fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
  vscodeIgnore: fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8'),
  templateFiles,
  templateContents: Object.fromEntries(
    templateFiles.map((name) => [
      name,
      JSON.parse(fs.readFileSync(path.join(templatesPath, name), 'utf8')),
    ]),
  ),
  manifestSchema: JSON.parse(fs.readFileSync(schemaPath, 'utf8')),
});

if (findings.length > 0) {
  for (const finding of findings) console.error(finding);
  throw new Error(`public current-surface gate found ${findings.length} issue(s)`);
}
console.log('Public current-surface gate passed.');
