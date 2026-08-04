# KDNA VS Code Role

Status: Implementation Contract
Normative: No
Protocol Source of Truth: `aikdna/kdna`
Repository Mission: Retained
Current Maturity: Source candidate; workspace controls pending human UI acceptance

`kdna-vscode` is a project-view editing and diagnostics tool. It is not an
authorization runtime, authoring authority, registry client, or marketplace.
The `0.2.0` source candidate is recertified against the current corrective Core
coordinate, but it is not a published Marketplace release or compatibility
claim.

## Responsibilities

- Edit KDNA project-view JSON and Studio-compatible authoring workspaces.
- Validate source structure and surface diagnostics while the user edits.
- Preview project-view structure for development review.
- Keep Creation delegated to a separately installed compatible Studio CLI;
  the current extension does not invoke it or generate a replacement manifest.
- Use Core's official contracts for one explicitly opened packaged asset.
- Call the exact configured CLI for workspace attachment status and controls.
- Keep attachment identity, digest, scope, state, and control entry visible.
- Make clear when a workspace is project-view material rather than a runtime
  distribution asset.

## Non-Responsibilities

- Do not define access modes, entitlement profiles, issue codes, crypto
  profiles, or LoadPlan states.
- Do not implement license or entitlement checks inside the extension.
- Do not treat top-level `KDNA_Core.json` / `KDNA_Patterns.json` source trees as
  installed runtime assets.
- Do not create release-reviewed `.kdna` exports. Reviewed export provenance
  belongs to KDNA Studio or a Studio-compatible compiler.
- Do not describe technical validate, pack, or preview operations as Creation
  Complete or as evidence that Studio creation gates ran.
- Do not require a registry or marketplace for local `.kdna` loading.
- Do not parse `.kdna/attachments.json`, scan a global asset directory, or
  implement another resolver or attachment database.
- Do not accept passwords or caller-supplied entitlement state.
- Do not resolve or execute a workspace-configured CLI in VS Code Restricted
  Mode; the setting and command surfaces remain gated on Workspace Trust.

## Runtime Diagnostics

For one explicitly opened file, the extension uses Core's official inspect,
LoadPlan, and Runtime Capsule operations. For a workspace relation, it passes
one exact local root to the configured CLI:

```bash
kdna attachments --cwd ./project
kdna disable <attachment-id> --cwd ./project
kdna rollback <attachment-id> --cwd ./project
```

Attach and switch remain interactive CLI operations: the CLI presents the
exact preview and owns positive confirmation. The extension may present CLI
state and controls, but it must not recompute authorization or applicability.
