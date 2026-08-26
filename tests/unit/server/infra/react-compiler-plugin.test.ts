import { describe, expect, it, vi } from 'vitest'

import { reactCompilerPlugin } from '@/server/infra/react-compiler-plugin'

// The plugin's transform handler is invoked directly with a mock Vite
// hook context — no dev server needed for these assertions.

function makeContext(consumer: 'client' | 'server' | undefined) {
  return {
    environment: consumer === undefined ? undefined : { config: { consumer } },
    warn: vi.fn(),
    error: vi.fn(() => {
      throw new Error('fatal diagnostic raised')
    }),
  } as never
}

async function runTransform(code: string, id: string, consumer: 'client' | 'server' | undefined = 'client') {
  const plugin = reactCompilerPlugin()
  // The object form of the transform hook stores the handler under `.handler`.
  const hooks = typeof plugin.transform === 'object' ? plugin.transform.handler : plugin.transform
  return (hooks as (this: never, code: string, id: string) => Promise<unknown>).call(
    makeContext(consumer) as never,
    code,
    id,
  )
}

describe('reactCompilerPlugin', () => {
  it('memoizes a client component while preserving JSX', async () => {
    const source = [
      "import { useState } from 'react'",
      '',
      'export function Counter({ start }: { start: number }) {',
      '  const [n, setN] = useState(start)',
      '  const doubled = n * 2',
      '  return <button onClick={() => setN(n + 1)}>{doubled}</button>',
      '}',
    ].join('\n')

    const result = (await runTransform(source, '/src/ui/counter.tsx')) as { code: string } | null

    expect(result).not.toBeNull()
    expect(result?.code).toContain('react/compiler-runtime')
    expect(result?.code).toContain('_c(')
    // JSX stays intact for Vite's native Oxc transform downstream.
    expect(result?.code).toContain('<button')
  }, 30_000)

  it('skips server environments', async () => {
    const result = await runTransform('export function A() { return null }', '/src/ui/a.tsx', 'server')
    expect(result).toBeNull()
  })

  it('skips files without component/hook signals', async () => {
    const result = await runTransform('export const value = computeTotal(items)', '/src/shared/utils/x.ts', 'client')
    expect(result).toBeNull()
  })

  it('raises fatal diagnostics', async () => {
    await expect(runTransform('export function A( {', '/src/ui/broken.tsx')).rejects.toThrow('fatal diagnostic raised')
  })
})
