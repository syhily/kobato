import { CHUNKS_SENTINEL } from '@kobato/distribution/route-warmup'
import { routeWarmupPlugin } from '@kobato/pack/vite/route-warmup'
import { describe, expect, it } from 'vitest'

const VIRTUAL = '@/route-warmup/compiled-script'
const RESOLVED = `\0${VIRTUAL}`

describe('routeWarmupPlugin — virtual module hooks', () => {
  function makePlugin() {
    return routeWarmupPlugin() as {
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

  it('bundles the app idle entry on the build path and keeps the chunk sentinel', async () => {
    const plugin = makePlugin()
    plugin.config?.({}, { command: 'build', mode: 'production' })
    const code = await plugin.load?.(RESOLVED)
    expect(code).toContain(CHUNKS_SENTINEL)
    expect(code).toMatch(/^export default "/)
  }, 60_000)
})
