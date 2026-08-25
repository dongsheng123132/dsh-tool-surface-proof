# Security

Report vulnerabilities through GitHub private vulnerability reporting when available. Do not include production tool schemas, internal tool names, credentials, signed URLs, business payloads, or customer data.

The verifier is offline and executes no external commands. It reads one explicit workspace-relative regular manifest, rejects symlinks and path escape, rejects secret-shaped values, and writes only a content-addressed redacted JSON report beneath the explicit artifact directory. The report contains hashes, counts and drift categories—not tool names, descriptions or schemas.

This is conformance evidence for recorded inputs, not a security audit, authorization engine, runtime capture mechanism, or proof that the recording process was honest.
