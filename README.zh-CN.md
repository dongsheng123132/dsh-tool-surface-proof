# dsh-tool-surface-proof

为一个真实 DeepSeek Harness 部署的**模型可见工具面**生成内容寻址一致性证据，覆盖 agent scope、权限模式与呈现模式。

DSH 官方已经通过真实启动工具插件生成默认 Tool Schema Catalog；`dsh-mcp-lens` 也已经覆盖大型 MCP 目录压缩与 schema budget。本插件不复制这些能力，只验证部署态显式录制 envelope 是否仍等于人工批准的哈希锁。例如升级后，owner/native 与 reader/native 两个表面是否仍暴露完全相同的工具身份与 schema。

版本 1 契约绑定部署 revision、评估时间、freshness 策略、批准 surface，以及每个 surface 的 `agentScope`、`permissionMode`、`presentationMode` 与有序 `{nameHash, schemaHash, position}`。验证器区分缺失/新增 surface、权限元数据错位、工具新增/删除、schema 改动、顺序漂移、陈旧/未来观测、重复身份和 revision 不一致。

报告只含 SHA-256、计数和差异类别，不返回工具名、描述、schema、业务正文或秘密。它不抓取实时运行时、不授权、不执行命令、不连接 MCP，也不证明录制器诚实；观测必须由部署方的可信录制器生成并人工审查批准锁。

```bash
dsh-tool-surface-proof inspect --manifest surface.json
dsh-tool-surface-proof verify --workspace-root . --manifest surface.json --artifact-dir artifacts
npm test
npm run check
npm run smoke:plugin
npm run smoke:mcp
```

MIT License。安全边界见 [SECURITY.md](SECURITY.md)。
