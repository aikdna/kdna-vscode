# KDNA Developer Tools for VS Code

**Edit KDNA project views, inspect explicit `.kdna` assets, and manage approved
workspace attachments through the official KDNA CLI — all from inside VS Code.**

This extension helps developers working with KDNA judgment assets:

- **Validate Project View** (`KDNA: Validate Project View (Technical)`) — check
  project-view JSON structure and surface scope/boundary diagnostics while you
  edit.
- **Pack / Unpack** — pack a project view into a `.kdna` container, or unpack an
  existing `.kdna` file.
- **Preview Structure** — inspect a `.kdna` asset through the official Core
  contracts and see the Runtime Capsule context.
- **Workspace Attachments** — a visible, workspace-scoped control surface for
  approved CLI attachments (status, disable/enable, switch, offline rollback,
  remove).

All parsing, integrity, authorization, and projection are delegated to the
official KDNA Core and CLI. This extension does not teach the editor a parallel
KDNA format, and it does not define container fields, access modes, crypto,
LoadPlan states, or Runtime Capsule semantics. It renders `.kdna` files with
syntax highlighting and runs the exact operations below.

> New to KDNA? → [KDNA Core](https://github.com/aikdna/kdna)
>
> Creating assets? → [@aikdna/kdna-studio-cli](https://github.com/aikdna/kdna-studio-cli)
>
> The exact published runtime toolchain →
> [@aikdna/kdna-cli](https://github.com/aikdna/kdna-cli)

---

## Install

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=aikdna.kdna-vscode)
(search "KDNA Developer Tools"), or install a local `.vsix` build:

```bash
npm ci
npm run package
code --install-extension kdna-vscode-0.2.0.vsix
```

Or via the UI: Extensions view → `···` menu → **Install from VSIX...** →
select the `.vsix` file.

### Pointing the extension at the CLI

Workspace attachment controls need an explicit path to the official CLI entry
(`@aikdna/kdna-cli@0.36.1` or later). Add this to your workspace settings:

```json
{
  "kdna.workspaceCliEntry": "/absolute/path/to/@aikdna/kdna-cli/src/cli.js"
}
```

With the setting empty, workspace controls stay disabled. Nothing is resolved
or launched until the workspace is trusted (VS Code Restricted Mode keeps the
controls disabled), and no fallback CLI or `PATH` scan is attempted.

---

## Quick start

1. **Open a project view.** Open a JSON project-view file or a Studio-compatible
   authoring workspace.
2. **Validate.** Run **KDNA: Validate Project View (Technical)** from the
   Command Palette. Fix the reported structure and scope diagnostics.
3. **Pack.** Run **KDNA: Pack Project View (Not Creation Complete)** to produce a
   `.kdna` container.
4. **Inspect an asset.** Run **KDNA: Open Local .kdna Asset** and choose a
   `.kdna` file, or use **KDNA: Preview Structure (Technical)**. Content is
   projected through the official LoadPlan and Runtime Capsule contracts.
5. **Check attachments.** Run **KDNA: Workspace Attachments** to see the active
   workspace's approved identity, digest, role, scope, and enabled state, then
   disable/enable, switch, rollback offline, or remove the relation. Attach and
   switch run the official CLI in an interactive terminal so its exact preview
   and confirmation remain authoritative.

---

## Status

- **Version:** `0.2.0`, bound to the published `@aikdna/kdna-core@0.21.0`. The
  `0.1.0` line was the earlier GitHub-only release.
- **Compatibility:** `0.2.0` routes `.kdna` inspection and loading
  through the exact published `@aikdna/kdna-core@0.21.0` contracts and the
  published CLI. It does not inherit a compatibility claim from the older
  `0.1.0` extension.
- **Creation:** the retired parallel project-view creation action is disabled in
  `0.2.0`. This extension does not invoke it or generate a replacement manifest.
  To create an asset, install `@aikdna/kdna-studio-cli` separately and
  follow that package's creation flow. `Validate Project View`, `Pack Project
  View`, and `Preview Structure` remain technical developer operations; they do not run the Studio creation gates and do not make an asset publication-ready.
- A `.vsix` built from this source is for evaluation only and does not carry the
  support or compatibility status of a Marketplace release.

## Development

```bash
npm ci
npm test
```


## Official packages

Official KDNA packages are published under the `@aikdna` npm scope and the
`aikdna` name on PyPI. The unscoped npm package `kdna` is not affiliated with
the KDNA project. Install only from the official coordinates shown in this
README.

## License

Apache-2.0 — see [LICENSE](LICENSE).
