# KDNA Developer Tools for VS Code

> **Status:** editor-integration mission retained. The source-only corrective
> candidate is bound to exact KDNA Core bytes; it has not been published to the
> Marketplace or established as a stable compatibility surface.

This repository owns KDNA's editor integration: helping a developer make
judgment material explicit, inspect and diagnose it while editing, and invoke
the official consumption contracts without teaching the editor a parallel
KDNA format.

The local `0.2.0` corrective candidate routes packaged assets through the
current CBOR, LoadPlan, and Runtime Capsule contracts. Its expanded project
view remains an editor-side authoring surface, not a parallel runtime format.
The exact candidate still requires ecosystem compatibility and publication
gates before a release can be proposed.

## Mission

- Edit KDNA project-view JSON and Studio-compatible authoring workspaces.
- Surface source structure, scope and boundary diagnostics during editing.
- Keep Creation in the separate Studio CLI. This extension currently neither
  invokes Studio nor creates its own project-view or manifest format.
- Use Core's official inspect, LoadPlan, and Runtime Capsule contracts for one
  explicitly opened `.kdna` file.
- Use the exact configured CLI for approved workspace attachment status and
  controls instead of reading or rewriting `.kdna/attachments.json`.

## Workspace attachment

The extension adds a visible, workspace-scoped control surface. It requires
an explicit resource setting pointing to the exact CLI entry (CLI 0.36.0 or
later):

```json
{
  "kdna.workspaceCliEntry": "/absolute/path/to/@aikdna/kdna-cli/src/cli.js"
}
```

The CLI is published; point this setting at the installed CLI entry. An empty
setting leaves workspace controls disabled rather than falling back to another
CLI or scanning `PATH`.

Workspace attachment controls are also disabled in VS Code Restricted Mode.
The CLI setting is declared trust-sensitive, and no configured executable is
resolved or launched until VS Code reports that the workspace is trusted.

The status bar shows the active workspace's approved identity/version or a
clear none/disabled/error state. `KDNA: Workspace Attachments` displays exact
digest, role, scope, and enabled state, then offers disable/enable, switch,
offline rollback, and relation-only remove. Disable offers an immediate Enable
action; rollback and remove require confirmation. Attach and switch run the
official CLI in an interactive terminal so its exact preview and `y/N`
confirmation remain authoritative.

Multi-root workspaces are never merged. The user chooses a workspace when none
is active, and each operation passes that one root to the CLI. The extension
does not scan a global asset directory, read or parse
`.kdna/attachments.json` directly, accept passwords, infer entitlement, or
mutate snapshots itself. It validates the exact CLI's bounded status JSON.

## Current release boundary

- Marketplace currently carries the historical `0.1.0` incumbent. The current
  `0.2.0` source and its expanded workspace contract have not been published
  and do not inherit a compatibility claim from that older extension.
- The current `0.2.0` source is an unreleased evaluation candidate, not a
  Marketplace release or a stable support commitment.
- Old direct project-view operations are historical implementation debt,
  not protocol authority and not a pattern for new integrations.
- Any future release must bind exact compatible Core/CLI versions and pass the
  extension's contract, security, packaging, and Marketplace release checks.

## Creation and technical project-view operations

The retired parallel project-view creation action is disabled in the `0.2.0`
source candidate because it generated an obsolete manifest that the current
Core contract rejects. To create an asset, install an exact compatible
`@aikdna/kdna-studio-cli` separately and follow that package's creation flow.
This extension does not invoke it or generate a replacement manifest, does not
discover a Studio executable from `PATH`, and does not claim that Studio
integration is already present.

`Validate Project View`, `Pack Project View`, and `Preview Structure` remain
developer operations. They check or transform technical project-view bytes;
they do not run the Studio creation gates, do not establish Creation Complete,
and do not make an asset publication-ready.

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

The current `0.2.0` extension is not published to the VS Code Marketplace.
Build a local candidate from the checked-out source before installing it:

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

Marketplace publication status is unchanged: `0.1.0` remains the published
incumbent and `0.2.0` remains unpublished. Any `.vsix` file built here is for
source evaluation and does not carry the support or compatibility status of a
Marketplace release.

## License

Apache-2.0 — see [LICENSE](LICENSE).
