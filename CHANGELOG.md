# Changelog

## 0.2.0 (2026-07-20)

- Route packaged `.kdna` inspection and loading through KDNA Core
  `inspect → planLoad → load` and consume only Runtime Capsules.
- Remove direct ZIP/payload consumption and the unused JSZip runtime
  dependency.
- Bind the extension to the published npm `@aikdna/kdna-core@0.21.0`
  registry tarball (gitHead `32aa3ff8e633291d4bb9e01de5a70181c8415d93`),
  consumed from the official registry rather than a local candidate.
- Surface Core's compact-projection omission status, paths, and counts in the
  editor preview instead of hiding a partial projection.
- Keep source-project diagnostics separate from packaged Runtime validation,
  escape preview rendering, and add compile, lint, and unit coverage for
  blocked LoadPlans and Capsule delivery.
- Add a workspace-scoped status and control surface that delegates only to an
  explicitly configured exact CLI 0.36.0 entry. It shows identity,
  version, digest, role, scope, and enabled state without reading or parsing
  `.kdna/attachments.json` directly.
- Provide explicit disable/enable, switch, offline rollback, relation-only
  remove, and attach entry points. Attach and switch retain the CLI's native
  exact preview and positive terminal confirmation; destructive-looking
  controls use confirmation or an immediate undo action.
- Keep multi-root workspaces separate and fail closed when the CLI is absent,
  incompatible, produces an extended record, or rejects the request. No PATH
  discovery, global asset scan, password input, or entitlement claim is added.
- Declare the CLI setting as trust-sensitive and keep attachment commands and
  process execution disabled in VS Code Restricted Mode.

The 0.2.0 extension has not yet been published to the Visual Studio
Marketplace; no Marketplace listing or existing release is changed.

## 2026-05-30
- Updated unit tests to allow KDNA_CARD.json and reports/ entries
- Fixed CI: npm ci for dependency install

## 2026-05-25
- Initial release: KDNA domain validation, preview, and dev source workspace management
