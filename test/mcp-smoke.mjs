import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fixtureManifest, stable } from './helpers.mjs'

const child = spawn(process.execPath, ['mcp-server.mjs'], { cwd: new URL('../', import.meta.url), shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } })
let buffer = ''; const responses = []
child.stdout.setEncoding('utf8')
child.stdout.on('data', chunk => { buffer += chunk; let cut; while ((cut = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, cut); buffer = buffer.slice(cut + 1); if (line) responses.push(JSON.parse(line)) } })
const send = (id, method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
const manifestJson = stable(fixtureManifest())
send(1, 'initialize'); send(2, 'tools/list'); send(3, 'tools/call', { name: 'tool_surface_verify', arguments: { manifestJson } })
const deadline = Date.now() + 5000
while (responses.length < 3 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
child.kill()
assert.equal(responses.length, 3)
assert.equal(responses[0].result.serverInfo.version, '0.1.0')
assert.equal(responses[1].result.tools.length, 2)
assert.equal(responses[2].result.structuredContent.verdict, 'conformant')
assert.ok(!JSON.stringify(responses[2]).includes('read_file'))
process.stdout.write(`${JSON.stringify({ ok: true, protocol: '2025-06-18', tools: 2, redacted: true })}\n`)
