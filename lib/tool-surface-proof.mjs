import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

const MAX_FILE = 4 * 1024 * 1024
const HEX = /^[a-f0-9]{64}$/
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/
const SECRET_VALUE = /(?:bearer\s+[a-z0-9._-]{12,}|(?:sk|ghp|github_pat)_[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i
const stable = value => JSON.stringify(value, (_, child) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child)
export const sha256 = value => createHash('sha256').update(value).digest('hex')
const fail = (code, message) => Object.assign(new Error(message), { code })
const boundedId = (value, label) => { if (typeof value !== 'string' || !ID.test(value)) throw fail('INVALID_MANIFEST', `${label} must be a bounded public id`) }
const hash = (value, label) => { if (!HEX.test(value || '')) throw fail('INVALID_MANIFEST', `${label} must be lowercase SHA-256`) }
const timestamp = (value, label) => { const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw fail('INVALID_TIME', `${label} must be an ISO timestamp`); return parsed }

function rejectSecretValues(value, path = '$') {
  if (typeof value === 'string' && SECRET_VALUE.test(value)) throw fail('SECRET_MATERIAL', `secret-shaped value rejected at ${path}`)
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (/(?:secret|password|credential|api[_-]?key|private[_-]?key|auth(?:orization)?|cookie)$/i.test(key)
      && (typeof child === 'string' || typeof child === 'number')) throw fail('SECRET_MATERIAL', `credential field rejected at ${path}.${key}`)
    rejectSecretValues(child, `${path}.${key}`)
  }
}

function toolDigest(tool) {
  if (!tool || typeof tool !== 'object') throw fail('INVALID_OBSERVATION', 'tool must be an object')
  if (typeof tool.name !== 'string' || !tool.name || tool.name.length > 256) throw fail('INVALID_OBSERVATION', 'tool.name must be bounded')
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object' || Array.isArray(tool.inputSchema)) throw fail('INVALID_OBSERVATION', 'tool.inputSchema must be an object')
  if (tool.outputSchema !== undefined && (!tool.outputSchema || typeof tool.outputSchema !== 'object' || Array.isArray(tool.outputSchema))) throw fail('INVALID_OBSERVATION', 'tool.outputSchema must be an object when present')
  rejectSecretValues(tool)
  return {
    nameHash: sha256(tool.name),
    schemaHash: sha256(stable({ name: tool.name, description: tool.description || '', inputSchema: tool.inputSchema, outputSchema: tool.outputSchema || null }))
  }
}

export function deriveApprovedSurface(observation) {
  validateObservationHeader(observation)
  const tools = observation.tools.map(toolDigest)
  if (new Set(tools.map(row => row.nameHash)).size !== tools.length) throw fail('INVALID_OBSERVATION', 'duplicate tool names are forbidden')
  return {
    surfaceId: observation.surfaceId,
    agentScope: observation.agentScope,
    permissionMode: observation.permissionMode,
    presentationMode: observation.presentationMode,
    tools: tools.map((row, position) => ({ ...row, position }))
  }
}

function validateObservationHeader(value) {
  for (const key of ['surfaceId', 'agentScope', 'permissionMode', 'presentationMode']) boundedId(value?.[key], `observation.${key}`)
  if (!Number.isInteger(value.sequence) || value.sequence < 0) throw fail('INVALID_OBSERVATION', 'observation.sequence must be a non-negative integer')
  timestamp(value.recordedAt, 'observation.recordedAt')
  if (!Array.isArray(value.tools) || value.tools.length > 4096) throw fail('INVALID_OBSERVATION', 'observation.tools must contain at most 4096 tools')
}

function parseManifest(input) {
  let manifest
  try { manifest = typeof input === 'string' ? JSON.parse(input) : structuredClone(input) } catch { throw fail('INVALID_MANIFEST', 'manifest must be JSON') }
  if (!manifest || manifest.schemaVersion !== 1) throw fail('INVALID_MANIFEST', 'schemaVersion 1 required')
  rejectSecretValues(manifest)
  boundedId(manifest.proofId, 'proofId'); boundedId(manifest.deployment?.revision, 'deployment.revision')
  const evaluationMs = timestamp(manifest.evaluationTime, 'evaluationTime')
  if (!Array.isArray(manifest.approvedSurfaces) || !manifest.approvedSurfaces.length || manifest.approvedSurfaces.length > 64) throw fail('INVALID_MANIFEST', '1..64 approvedSurfaces required')
  if (!Array.isArray(manifest.observations) || !manifest.observations.length || manifest.observations.length > 64) throw fail('INVALID_MANIFEST', '1..64 observations required')
  const approvedIds = new Set()
  for (const surface of manifest.approvedSurfaces) {
    for (const key of ['surfaceId', 'agentScope', 'permissionMode', 'presentationMode']) boundedId(surface?.[key], `approvedSurface.${key}`)
    if (approvedIds.has(surface.surfaceId)) throw fail('INVALID_MANIFEST', 'duplicate approved surfaceId')
    approvedIds.add(surface.surfaceId)
    if (!Array.isArray(surface.tools) || surface.tools.length > 4096) throw fail('INVALID_MANIFEST', 'approvedSurface.tools must contain at most 4096 locks')
    const names = new Set(); const positions = new Set()
    for (const tool of surface.tools) { hash(tool?.nameHash, 'tool.nameHash'); hash(tool?.schemaHash, 'tool.schemaHash'); if (!Number.isInteger(tool.position) || tool.position < 0) throw fail('INVALID_MANIFEST', 'tool.position must be non-negative'); if (names.has(tool.nameHash) || positions.has(tool.position)) throw fail('INVALID_MANIFEST', 'duplicate tool lock'); names.add(tool.nameHash); positions.add(tool.position) }
  }
  const observedIds = new Set()
  for (const observation of manifest.observations) { validateObservationHeader(observation); if (observedIds.has(observation.surfaceId)) throw fail('INVALID_MANIFEST', 'duplicate observed surfaceId'); observedIds.add(observation.surfaceId); if (observation.deploymentRevision !== manifest.deployment.revision) throw fail('REVISION_MISMATCH', 'observation revision differs from deployment revision') }
  const maxAgeMs = manifest.policy?.maxObservationAgeMs
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 365 * 86400000) throw fail('INVALID_MANIFEST', 'maxObservationAgeMs is out of range')
  if (manifest.policy?.requireStableOrder !== true && manifest.policy?.requireStableOrder !== false) throw fail('INVALID_MANIFEST', 'requireStableOrder must be boolean')
  return { manifest, evaluationMs }
}

function compareSurface(lock, observation, evaluationMs, policy) {
  const derived = deriveApprovedSurface(observation)
  const metadataMatched = ['agentScope', 'permissionMode', 'presentationMode'].every(key => lock[key] === observation[key])
  const expected = new Map(lock.tools.map(row => [row.nameHash, row]))
  const actual = new Map(derived.tools.map(row => [row.nameHash, row]))
  const missing = [...expected].filter(([name]) => !actual.has(name)).map(([name]) => name).sort()
  const added = [...actual].filter(([name]) => !expected.has(name)).map(([name]) => name).sort()
  const changed = [...expected].filter(([name, row]) => actual.has(name) && actual.get(name).schemaHash !== row.schemaHash).map(([name]) => name).sort()
  const reordered = [...expected].filter(([name, row]) => actual.has(name) && actual.get(name).position !== row.position).map(([name]) => name).sort()
  const recordedMs = timestamp(observation.recordedAt, 'observation.recordedAt')
  const fresh = recordedMs <= evaluationMs && evaluationMs - recordedMs <= policy.maxObservationAgeMs
  const orderMatched = !policy.requireStableOrder || reordered.length === 0
  const conformant = metadataMatched && fresh && missing.length === 0 && added.length === 0 && changed.length === 0 && orderMatched
  return {
    surfaceIdHash: sha256(lock.surfaceId),
    metadataMatched,
    fresh,
    sequence: observation.sequence,
    expectedToolCount: lock.tools.length,
    observedToolCount: observation.tools.length,
    differences: { missingNameHashes: missing, addedNameHashes: added, changedNameHashes: changed, reorderedNameHashes: policy.requireStableOrder ? reordered : [] },
    conformant
  }
}

export function inspectToolSurfaceManifestJson(manifestJson) {
  const { manifest } = parseManifest(manifestJson)
  return {
    schemaVersion: 1,
    proofIdHash: sha256(manifest.proofId),
    deploymentRevisionHash: sha256(manifest.deployment.revision),
    approvedSurfaceCount: manifest.approvedSurfaces.length,
    observationCount: manifest.observations.length,
    approvedToolLockCount: manifest.approvedSurfaces.reduce((sum, row) => sum + row.tools.length, 0),
    observedToolCount: manifest.observations.reduce((sum, row) => sum + row.tools.length, 0),
    returnsToolSchemas: false,
    returnsToolDescriptions: false,
    executesExternalCommands: false
  }
}

export function evaluateToolSurfaceManifest(manifestJson) {
  const { manifest, evaluationMs } = parseManifest(manifestJson)
  const observations = new Map(manifest.observations.map(row => [row.surfaceId, row]))
  const approved = new Map(manifest.approvedSurfaces.map(row => [row.surfaceId, row]))
  const missingSurfaceHashes = [...approved].filter(([id]) => !observations.has(id)).map(([id]) => sha256(id)).sort()
  const unexpectedSurfaceHashes = [...observations].filter(([id]) => !approved.has(id)).map(([id]) => sha256(id)).sort()
  const surfaces = [...approved].filter(([id]) => observations.has(id)).map(([id, lock]) => compareSurface(lock, observations.get(id), evaluationMs, manifest.policy)).sort((a, b) => a.surfaceIdHash.localeCompare(b.surfaceIdHash))
  const conformant = missingSurfaceHashes.length === 0 && unexpectedSurfaceHashes.length === 0 && surfaces.every(row => row.conformant)
  return {
    schemaVersion: 1,
    verdict: conformant ? 'conformant' : 'drift',
    proofIdHash: sha256(manifest.proofId),
    deploymentRevisionHash: sha256(manifest.deployment.revision),
    checks: { exactSurfaceSet: missingSurfaceHashes.length === 0 && unexpectedSurfaceHashes.length === 0, allSurfacesConformant: surfaces.every(row => row.conformant) },
    disclosures: { missingSurfaceHashes, unexpectedSurfaceHashes },
    surfaces,
    returnsToolSchemas: false,
    returnsToolDescriptions: false,
    executesExternalCommands: false,
    destructiveActions: false
  }
}

async function safeManifest(root, manifestPath) {
  if (typeof manifestPath !== 'string' || !manifestPath || manifestPath.length > 512 || isAbsolute(manifestPath)) throw fail('PATH_ESCAPE', 'manifestPath must be bounded and workspace-relative')
  const absolute = resolve(root, manifestPath); const rel = relative(root, absolute)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw fail('PATH_ESCAPE', 'manifestPath escapes workspaceRoot')
  let cursor = root; let stat; const parts = rel.split(/[\\/]/)
  for (const [index, part] of parts.entries()) {
    cursor = resolve(cursor, part)
    stat = await lstat(cursor).catch(() => { throw fail('MISSING_MANIFEST', 'manifest is missing') })
    if (stat.isSymbolicLink()) throw fail('UNSAFE_MANIFEST', 'manifest path must contain no symlink')
    if (index < parts.length - 1 && !stat.isDirectory()) throw fail('UNSAFE_MANIFEST', 'manifest parent must be a real directory')
  }
  if (!stat.isFile()) throw fail('UNSAFE_MANIFEST', 'manifest must be a regular non-symlink file')
  if (stat.size > MAX_FILE) throw fail('FILE_TOO_LARGE', 'manifest exceeds 4 MiB')
  const rootReal = await realpath(root); const fileReal = await realpath(absolute); const realRel = relative(rootReal, fileReal)
  if (realRel.startsWith('..') || isAbsolute(realRel)) throw fail('PATH_ESCAPE', 'real manifest path escapes workspaceRoot')
  return readFile(fileReal, 'utf8')
}

async function safeArtifactDir(root, artifactDir) {
  if (typeof artifactDir !== 'string' || !artifactDir || artifactDir.length > 512 || isAbsolute(artifactDir)) throw fail('PATH_ESCAPE', 'artifactDir must be bounded and workspace-relative')
  const dir = resolve(root, artifactDir); const rel = relative(root, dir)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw fail('PATH_ESCAPE', 'artifactDir escapes workspaceRoot')
  let cursor = root
  for (const part of rel.split(/[\\/]/)) { cursor = resolve(cursor, part); try { const stat = await lstat(cursor); if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('UNSAFE_ARTIFACT_DIR', 'artifactDir components must be real directories') } catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(cursor) } }
  return dir
}

export async function verifyToolSurfaceManifest({ workspaceRoot, manifestPath, artifactDir }) {
  const root = resolve(workspaceRoot)
  const manifestJson = await safeManifest(root, manifestPath)
  const report = evaluateToolSurfaceManifest(manifestJson)
  const bytes = Buffer.from(`${stable(report)}\n`)
  const digest = sha256(bytes)
  const dir = await safeArtifactDir(root, artifactDir)
  const output = resolve(dir, `tool-surface-proof-${digest}.json`)
  try { await writeFile(output, bytes, { flag: 'wx' }) } catch (error) { if (error.code !== 'EEXIST') throw error; const existing = await readFile(output); if (!existing.equals(bytes)) throw fail('ARTIFACT_DIVERGED', 'content-addressed artifact diverged') }
  const readBack = await readFile(output)
  if (sha256(readBack) !== digest) throw fail('READBACK_FAILED', 'artifact read-back verification failed')
  return { ...report, artifact: { path: relative(root, output).replaceAll('\\', '/'), sha256: digest, verifiedByReadBack: true } }
}
