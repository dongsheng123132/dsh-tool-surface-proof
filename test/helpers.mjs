import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveApprovedSurface } from '../lib/tool-surface-proof.mjs'

export const stable = value => JSON.stringify(value, (_, child) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child)

export function fixtureManifest(change = {}) {
  const owner = {
    surfaceId: 'owner-native', agentScope: 'owner', permissionMode: 'full', presentationMode: 'native',
    deploymentRevision: 'release-2026-08-26', sequence: 7, recordedAt: '2026-08-26T00:00:00.000Z',
    tools: [
      { name: 'read_file', description: 'Read an allowed file.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
      { name: 'write_file', description: 'Write an approved file.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } }
    ]
  }
  const restricted = {
    surfaceId: 'reader-native', agentScope: 'reader', permissionMode: 'read-only', presentationMode: 'native',
    deploymentRevision: 'release-2026-08-26', sequence: 8, recordedAt: '2026-08-26T00:01:00.000Z',
    tools: [owner.tools[0]]
  }
  const manifest = {
    schemaVersion: 1,
    proofId: 'deployment-surface-001',
    deployment: { revision: 'release-2026-08-26' },
    evaluationTime: '2026-08-26T00:05:00.000Z',
    policy: { maxObservationAgeMs: 3600000, requireStableOrder: true },
    approvedSurfaces: [deriveApprovedSurface(owner), deriveApprovedSurface(restricted)],
    observations: [structuredClone(owner), structuredClone(restricted)]
  }
  if (change.mutate) change.mutate(manifest)
  return manifest
}

export async function writeFixture(root, change = {}) {
  const manifest = fixtureManifest(change)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'surface.json'), stable(manifest))
  return manifest
}
