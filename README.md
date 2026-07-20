# KDNA Developer Tools for VS Code

> **Status:** editor-integration mission retained; current maturity and exact
> KDNA Core compatibility are unassessed. This repository is source-only and
> has no currently approved Marketplace release.

This repository owns KDNA's editor integration: helping a developer make
judgment material explicit, inspect and diagnose it while editing, and invoke
the official creation and consumption contracts without teaching the editor a
parallel KDNA format.

The checked-in `0.1.0` source predates the current CBOR payload and Runtime
Capsule contracts and depends on an older `@aikdna/kdna-core` coordinate. It
must be independently recertified against exact current protocol and CLI
versions before a release can be proposed. That limitation blocks the current
source from a release wave; it does not cancel the repository's mission.

## Mission

- Edit KDNA project-view JSON and Studio-compatible authoring workspaces.
- Surface source structure, scope and boundary diagnostics during editing.
- Invoke the official Studio path when a user creates or exports an asset.
- Invoke `kdna validate` and `kdna plan-load` for runtime diagnostics.
- Present an authorized Runtime Capsule through the official CLI/Core loading
  contract instead of decoding a `.kdna` container directly.

## Current release boundary

- No current Marketplace publication or compatibility claim exists.
- The current source is not an approved adapter for a current KDNA release.
- Old direct ZIP/project-view operations are historical implementation debt,
  not protocol authority and not a pattern for new integrations.
- A future release requires an owner-reviewed fact card, exact Core/CLI pins,
  contract tests and normal release approval. No tag or release automation is
  authorized before that checkpoint.

## Protocol ownership

The extension does not define container fields, access modes, entitlement
profiles, crypto, LoadPlan states or Runtime Capsule semantics. Those contracts
belong to [`aikdna/kdna`](https://github.com/aikdna/kdna). Runtime and authoring
operations must be delegated to the exact compatible versions of:

- [`@aikdna/kdna-core`](https://github.com/aikdna/kdna)
- [`@aikdna/kdna-cli`](https://github.com/aikdna/kdna-cli)
- [`@aikdna/kdna-studio-cli`](https://github.com/aikdna/kdna-studio-cli)

See [docs/ROLE.md](docs/ROLE.md) for the detailed responsibility boundary.

## Development

The source is retained for recertification work. Do not interpret a local
build as compatibility or release evidence.

```bash
npm ci
npm test
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
