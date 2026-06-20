# KDNA VS Code Role

Status: Implementation Contract
Normative: No
Protocol Source of Truth: `aikdna/kdna`

`kdna-vscode` is a developer-source editing and diagnostics tool. It is not an
authorization runtime, authoring authority, registry client, or marketplace.

## Responsibilities

- Edit KDNA source JSON and Studio-compatible source workspaces.
- Validate source structure and surface diagnostics while the user edits.
- Preview source structure for development review.
- Call `kdna validate` for validation evidence.
- Call `kdna plan-load` for runtime authorization diagnostics.
- Make clear when a workspace is source material rather than a runtime
  distribution asset.

## Non-Responsibilities

- Do not define access modes, entitlement profiles, issue codes, crypto
  profiles, or LoadPlan states.
- Do not implement license or entitlement checks inside the extension.
- Do not treat top-level `KDNA_Core.json` / `KDNA_Patterns.json` source trees as
  installed runtime assets.
- Do not create release-reviewed `.kdna` exports. Reviewed export provenance
  belongs to KDNA Studio or a Studio-compatible compiler.
- Do not require a registry or marketplace for local `.kdna` loading.

## Runtime Diagnostics

When runtime loading status is needed, the extension should shell out to the
official CLI and render its machine-readable result:

```bash
kdna plan-load ./asset.kdna --json
kdna validate ./asset.kdna --runtime --json
```

The extension may present the returned state and issue codes, but it must not
recompute authorization from manifest fields.
