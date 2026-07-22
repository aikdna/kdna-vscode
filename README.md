# KDNA Developer Tools for VS Code

> **Status:** editor-integration mission retained. The source-only corrective
> candidate is bound to exact merged KDNA Core commit
> `76bbc587ce05f7e575c2373832cc5c9eee9df98a`; no Marketplace release or
> compatibility approval has been granted.

This repository owns KDNA's editor integration: helping a developer make
judgment material explicit, inspect and diagnose it while editing, and invoke
the official creation and consumption contracts without teaching the editor a
parallel KDNA format.

The local `0.2.0` corrective candidate routes packaged assets through the
current CBOR, LoadPlan, and Runtime Capsule contracts. Its expanded project
view remains an editor-side authoring surface, not a parallel runtime format.
The exact candidate still requires final ecosystem validation and owner
approval before a release can be proposed.

## Mission

- Edit KDNA project-view JSON and Studio-compatible authoring workspaces.
- Surface source structure, scope and boundary diagnostics during editing.
- Invoke the official Studio path when a user creates or exports an asset.
- Invoke `kdna validate` and `kdna plan-load` for runtime diagnostics.
- Present an authorized Runtime Capsule through the official CLI/Core loading
  contract instead of decoding a `.kdna` container directly.

## Current release boundary

- No current Marketplace publication or compatibility claim exists.
- The current source is a locally verified candidate, not an owner-approved
  adapter release.
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

The source is under exact-coordinate recertification. A local green build is
candidate evidence, not release approval.

```bash
npm ci
npm test
```

## Installing from a .vsix package

The extension is not published to the VS Code Marketplace. Build a local
candidate from the checked-out source before installing it:

```bash
npm ci
npm run package
```

From the command line:

```bash
code --install-extension kdna-vscode-0.2.0.vsix
```

Or via the UI: Extensions view → `···` menu → **Install from VSIX...** →
select the `.vsix` file.

Marketplace publication status is unchanged: there is no current Marketplace
release. Any `.vsix` file built here is a local candidate, not an owner-approved
adapter release, and remains subject to the release boundary above.

## License

Apache-2.0 — see [LICENSE](LICENSE).
