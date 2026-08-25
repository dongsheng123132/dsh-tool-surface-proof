import { inspectToolSurfaceManifestJson, verifyToolSurfaceManifest } from './lib/tool-surface-proof.mjs'

export const name = 'dsh-tool-surface-proof'
export const inject = ['tools']
const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
const define = value => ({ ...value, output: { schema: {}, render: renderJson } })

export function createDefinitions(_ctx = {}, config = {}) {
  const workspaceRoot = config.workspaceRoot || process.cwd()
  return [
    define({
      name: 'dsh_tool_surface_inspect',
      description: 'Inspect counts and policy dimensions from an explicit tool-surface manifest without returning schemas or descriptions.',
      parameters: { type: 'object', required: ['manifestJson'], properties: { manifestJson: { type: 'string' } }, additionalProperties: false },
      execute: async ({ manifestJson }) => inspectToolSurfaceManifestJson(manifestJson)
    }),
    define({
      name: 'dsh_tool_surface_verify',
      description: 'Verify recorded model-visible DSH tool surfaces against approved hashes and write a content-addressed redacted report.',
      parameters: { type: 'object', required: ['manifestPath', 'artifactDir'], properties: { manifestPath: { type: 'string' }, artifactDir: { type: 'string' } }, additionalProperties: false },
      execute: async args => verifyToolSurfaceManifest({ workspaceRoot, ...args })
    })
  ]
}

export function apply(ctx, config = {}) {
  for (const definition of createDefinitions(ctx, config)) ctx.tools.register(definition)
}
