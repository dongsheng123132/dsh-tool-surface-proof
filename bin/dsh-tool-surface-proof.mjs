#!/usr/bin/env node
import { inspectToolSurfaceManifestJson, verifyToolSurfaceManifest } from '../lib/tool-surface-proof.mjs'
import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const flag = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null }
try {
  const command = args[0]
  if (command === 'inspect') {
    const manifestPath = flag('--manifest')
    if (!manifestPath) throw Object.assign(new Error('--manifest is required'), { code: 'USAGE' })
    process.stdout.write(`${JSON.stringify(inspectToolSurfaceManifestJson(await readFile(manifestPath, 'utf8')))}\n`)
  } else if (command === 'verify') {
    const manifestPath = flag('--manifest'); const artifactDir = flag('--artifact-dir'); const workspaceRoot = flag('--workspace-root') || process.cwd()
    if (!manifestPath || !artifactDir) throw Object.assign(new Error('--manifest and --artifact-dir are required'), { code: 'USAGE' })
    process.stdout.write(`${JSON.stringify(await verifyToolSurfaceManifest({ workspaceRoot, manifestPath, artifactDir }))}\n`)
  } else throw Object.assign(new Error('usage: dsh-tool-surface-proof <inspect|verify> ...'), { code: 'USAGE' })
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || 'ERROR', message: error.message })}\n`)
  process.exitCode = error.code === 'USAGE' ? 2 : 1
}
