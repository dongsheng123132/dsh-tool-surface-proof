# dsh-tool-surface-proof

**Maintainer / Author：He Fangsheng (贺方升 / 贺去病; also known as Dosen) · [hequbing.com](https://www.hequbing.com)**

Content-addressed evidence that the **actual recorded model-visible tool surface of one DeepSeek Harness deployment** still matches an approved lock across agent scopes, permission modes and presentation modes.

DeepSeek Harness already generates an official default Tool Schema Catalog by booting shipped tool plugins. `dsh-mcp-lens` already compresses large MCP catalogs and offers schema-budget checks. This plugin does neither. It verifies deployment-specific, explicitly recorded envelopes: for example, whether an owner/native surface and a reader/native surface still expose exactly the approved tool identities and schemas after an upgrade.

## Evidence contract

Schema version 1 binds an exact deployment revision, evaluation time, freshness policy and one approved surface per `surfaceId`. Each surface declares `agentScope`, `permissionMode`, `presentationMode`, and ordered `{nameHash, schemaHash, position}` locks. Each observation records the same public dimensions plus the model-visible tool objects captured by a separate trusted recorder.

The verifier detects missing or unexpected surfaces, scope/permission/presentation mismatch, added or removed tools, schema changes, optional order drift, stale/future observations, duplicate identities and revision mismatch. Reports contain only SHA-256 identities, counts and drift categories. They never return tool names, descriptions, schemas or raw business content.

This plugin does not capture live runtime state, grant or deny permission, execute commands, connect to MCP servers, or prove that a recorder was honest. Use a trusted deployment-specific recorder to create the observation envelope and review the lock before approval.

## CLI

```bash
dsh-tool-surface-proof inspect --manifest surface.json
dsh-tool-surface-proof verify --workspace-root . --manifest surface.json --artifact-dir artifacts
```

Verification reads one workspace-relative regular file, rejects symlinks and traversal, performs no network requests or subprocesses, and writes only one content-addressed JSON report below the explicit artifact directory with exclusive creation and read-back verification.

## DSH and MCP

The DSH bundle exposes `dsh_tool_surface_inspect` and `dsh_tool_surface_verify`. The independent stdio MCP server exposes inline, filesystem-free equivalents. Both call the same interface-free core.

```bash
npm test
npm run check
npm run smoke:plugin
npm run smoke:mcp
python C:/Users/ZhuanZ/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

MIT licensed. See [SECURITY.md](SECURITY.md).
