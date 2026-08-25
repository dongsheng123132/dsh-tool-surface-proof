import assert from 'node:assert/strict'
import * as plugin from '../index.js'
assert.equal('default' in plugin, false)
assert.equal(plugin.name, 'dsh-tool-surface-proof')
assert.deepEqual(plugin.inject, ['tools'])
assert.deepEqual(plugin.createDefinitions().map(row => row.name), ['dsh_tool_surface_inspect', 'dsh_tool_surface_verify'])
process.stdout.write(`${JSON.stringify({ ok: true, namespaceLoaderSafe: true, tools: 2 })}\n`)
