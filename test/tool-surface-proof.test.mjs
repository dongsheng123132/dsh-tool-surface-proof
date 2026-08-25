import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateToolSurfaceManifest, inspectToolSurfaceManifestJson, verifyToolSurfaceManifest } from '../lib/tool-surface-proof.mjs'
import { fixtureManifest, stable, writeFixture } from './helpers.mjs'

test('conformant deployment produces redacted exact-surface evidence', () => {
  const report = evaluateToolSurfaceManifest(fixtureManifest())
  assert.equal(report.verdict, 'conformant')
  assert.equal(report.surfaces.length, 2)
  assert.equal(report.returnsToolSchemas, false)
  assert.ok(!JSON.stringify(report).includes('read_file'))
  assert.ok(!JSON.stringify(report).includes('Read an allowed file'))
})

test('added tool fails closed with only a name hash disclosed', () => {
  const report = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => m.observations[1].tools.push({ name: 'delete_file', description: 'Delete.', inputSchema: { type: 'object' } }) }))
  assert.equal(report.verdict, 'drift')
  assert.equal(report.surfaces.find(row => row.differences.addedNameHashes.length > 0).differences.addedNameHashes.length, 1)
  assert.ok(!JSON.stringify(report).includes('delete_file'))
})

test('schema change is distinct from add or remove', () => {
  const report = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => { m.observations[0].tools[0].inputSchema.required = [] } }))
  const row = report.surfaces.find(item => item.observedToolCount === 2)
  assert.equal(row.differences.changedNameHashes.length, 1)
  assert.equal(row.differences.addedNameHashes.length, 0)
  assert.equal(row.differences.missingNameHashes.length, 0)
})

test('missing surface and metadata scope bleed are disclosed separately', () => {
  const missing = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => m.observations.pop() }))
  assert.equal(missing.disclosures.missingSurfaceHashes.length, 1)
  const bleed = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => { m.observations[1].permissionMode = 'full' } }))
  assert.equal(bleed.surfaces.find(row => row.observedToolCount === 1).metadataMatched, false)
})

test('stale, future and reordered observations fail closed', () => {
  const stale = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => { m.observations[0].recordedAt = '2026-08-25T00:00:00.000Z' } }))
  assert.equal(stale.surfaces.some(row => !row.fresh), true)
  const future = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => { m.observations[0].recordedAt = '2026-08-27T00:00:00.000Z' } }))
  assert.equal(future.verdict, 'drift')
  const reordered = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => { m.observations[0].tools.reverse() } }))
  assert.equal(reordered.surfaces.find(row => row.observedToolCount === 2).differences.reorderedNameHashes.length, 2)
})

test('order may be explicitly non-authoritative', () => {
  const report = evaluateToolSurfaceManifest(fixtureManifest({ mutate: m => { m.policy.requireStableOrder = false; m.observations[0].tools.reverse() } }))
  assert.equal(report.verdict, 'conformant')
})

test('secret material is rejected even though schema names remain auditable', () => {
  const manifest = fixtureManifest({ mutate: m => { m.observations[0].tools[0].inputSchema.properties.token = { type: 'string', default: 'Bearer abcdefghijklmnopqrstuvwxyz' } } })
  assert.throws(() => evaluateToolSurfaceManifest(manifest), error => error.code === 'SECRET_MATERIAL')
})

test('inspect reports counts and hashes without returning schemas', () => {
  const value = inspectToolSurfaceManifestJson(stable(fixtureManifest()))
  assert.equal(value.approvedSurfaceCount, 2)
  assert.equal(value.observedToolCount, 3)
  assert.equal(value.returnsToolSchemas, false)
  assert.ok(!JSON.stringify(value).includes('owner-native'))
})

test('content-addressed artifacts are replay safe and verified by read-back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tool-surface-proof-'))
  try {
    await writeFixture(root)
    const first = await verifyToolSurfaceManifest({ workspaceRoot: root, manifestPath: 'surface.json', artifactDir: 'artifacts' })
    const second = await verifyToolSurfaceManifest({ workspaceRoot: root, manifestPath: 'surface.json', artifactDir: 'artifacts' })
    assert.equal(first.artifact.sha256, second.artifact.sha256)
    assert.equal(first.artifact.verifiedByReadBack, true)
    const artifact = await readFile(join(root, first.artifact.path), 'utf8')
    assert.ok(!artifact.includes('read_file'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('manifest and artifact paths cannot escape the workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tool-surface-path-'))
  try {
    await writeFixture(root)
    await assert.rejects(() => verifyToolSurfaceManifest({ workspaceRoot: root, manifestPath: '../surface.json', artifactDir: 'artifacts' }), error => error.code === 'PATH_ESCAPE')
    await assert.rejects(() => verifyToolSurfaceManifest({ workspaceRoot: root, manifestPath: 'surface.json', artifactDir: '../artifacts' }), error => error.code === 'PATH_ESCAPE')
  } finally { await rm(root, { recursive: true, force: true }) }
})
