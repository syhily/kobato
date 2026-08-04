import { describe, expect, it } from 'vitest'

// The entry.server export-surface half of the glue contract (the Hono /
// oRPC / request-context seams live in the server package's
// glue-contract.test.ts). entry.server is an app shell file, so this
// assertion moved with the app split into the core app's suite.
describe('glue contract / entry.server export surface', () => {
  it('keeps the default export, streamTimeout, and handleError', async () => {
    const entry = await import('@/entry.server')

    expect(typeof entry.default).toBe('function')
    expect(entry.streamTimeout).toBe(5_000)
    // Pinned by ADR-0005: the structured error-reporting hook that replaces
    // React Router's default console.error handler.
    expect(typeof entry.handleError).toBe('function')
  })
})
