import { routeWarmupPlugin } from '@kobato/server/infra/route-warmup'
import { describe, expect, it } from 'vitest'

const VIRTUAL = 'virtual:route-warmup-script'
const RESOLVED = `\0${VIRTUAL}`

// The new virtual-module hooks (resolveId/config/load) added alongside the
// bundled inline script. The build-mode `load` (which runs a real nested
// `vite.build`) is covered by `npm run build`; here we cover only the cheap,
// deterministic paths.

describe('routeWarmupPlugin — virtual module hooks', () => {
  // Cast to a minimal call-signature view; the Plugin type declares these as
  // optional/union-typed, so a direct structural cast keeps call sites clean.
  function makePlugin() {
    return routeWarmupPlugin({
      tier1Routes: ['root', 'routes/public/layout', 'routes/public/home'],
      tier2Prefixes: [['routes/public/', 'public']],
    }) as {
      config?: (config: unknown, env: { command: 'serve' | 'build'; mode: string }) => void
      resolveId?: (id: string) => string | undefined
      load?: (id: string) => Promise<string | undefined>
    }
  }

  it('resolves only the warmup virtual id', () => {
    const plugin = makePlugin()
    expect(plugin.resolveId?.(VIRTUAL)).toBe(RESOLVED)
    expect(plugin.resolveId?.('./something.ts')).toBeUndefined()
  })

  it('emits an empty script in dev (serve) without bundling', async () => {
    const plugin = makePlugin()
    plugin.config?.({}, { command: 'serve', mode: 'development' })
    await expect(plugin.load?.(RESOLVED)).resolves.toBe('export default ""\n')
  })

  it('ignores non-virtual ids in load', async () => {
    const plugin = makePlugin()
    await expect(plugin.load?.('/some/real/id.js')).resolves.toBeUndefined()
  })
})
