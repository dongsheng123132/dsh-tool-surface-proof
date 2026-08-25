import { evaluateToolSurfaceManifest, inspectToolSurfaceManifestJson } from './lib/tool-surface-proof.mjs'

const VERSION = '0.1.0'; const LIMIT = 6 * 1024 * 1024
const tools = [
  { name: 'tool_surface_inspect', description: 'Inspect bounded counts from an explicit DSH tool-surface manifest without returning schemas.', inputSchema: { type: 'object', required: ['manifestJson'], properties: { manifestJson: { type: 'string', maxLength: 4194304 } }, additionalProperties: false } },
  { name: 'tool_surface_verify', description: 'Verify an inline recorded DSH tool surface against approved hashes; returns only redacted drift evidence.', inputSchema: { type: 'object', required: ['manifestJson'], properties: { manifestJson: { type: 'string', maxLength: 4194304 } }, additionalProperties: false } }
]
const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const err = (id, error) => ({ jsonrpc: '2.0', id, error: { code: -32000, message: error.code || 'VERIFICATION_ERROR', data: { code: error.code || 'VERIFICATION_ERROR' } } })
async function dispatch(req) {
  if (req.method === 'initialize') return ok(req.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'dsh-tool-surface-proof', version: VERSION } })
  if (req.method === 'tools/list') return ok(req.id, { tools })
  if (req.method === 'tools/call') {
    const manifestJson = req.params?.arguments?.manifestJson
    const value = req.params?.name === 'tool_surface_inspect' ? inspectToolSurfaceManifestJson(manifestJson) : req.params?.name === 'tool_surface_verify' ? evaluateToolSurfaceManifest(manifestJson) : (() => { throw Object.assign(new Error('unknown tool'), { code: 'METHOD_NOT_FOUND' }) })()
    return ok(req.id, { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false })
  }
  throw Object.assign(new Error('unknown method'), { code: 'METHOD_NOT_FOUND' })
}
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', async chunk => {
  buffer += chunk; if (buffer.length > LIMIT) process.exit(1)
  let cut
  while ((cut = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, cut); buffer = buffer.slice(cut + 1); if (!line) continue
    let request; let response
    try { request = JSON.parse(line); response = await dispatch(request) } catch (error) { response = err(request?.id ?? null, error) }
    process.stdout.write(`${JSON.stringify(response)}\n`)
  }
})
