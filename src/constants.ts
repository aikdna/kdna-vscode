/** Command IDs, view IDs, and file patterns used across the extension. */

export const COMMANDS = {
  VALIDATE: 'kdna.validate',
  PACK: 'kdna.pack',
  UNPACK: 'kdna.unpack',
  PREVIEW: 'kdna.preview',
  INSTALL: 'kdna.install',
  CREATE: 'kdna.create',
  WORKSPACE_STATUS: 'kdna.workspaceStatus',
  WORKSPACE_ATTACH: 'kdna.workspaceAttach',
} as const;

export const VIEWS = {
  DOMAINS: 'kdna-domains',
} as const;

export const KDNA_FILE_PATTERN = '**/KDNA_*.json';
export const KDNA_MANIFEST_PATTERN = '**/kdna.json';
export const KDNA_PACKAGE_PATTERN = '**/*.kdna';

export const KDNA_REQUIRED_FILES = ['KDNA_Core.json', 'KDNA_Patterns.json'] as const;

export const KDNA_OPTIONAL_FILES = [
  'KDNA_Scenarios.json',
  'KDNA_Cases.json',
  'KDNA_Reasoning.json',
  'KDNA_Evolution.json',
] as const;

export const KDNA_ALL_FILES = [...KDNA_REQUIRED_FILES, ...KDNA_OPTIONAL_FILES] as const;
