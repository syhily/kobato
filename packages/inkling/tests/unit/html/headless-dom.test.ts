// @vitest-environment node
import { HEADLESS_DOM_MISSING_MESSAGE, resolveHeadlessDom } from '@kobato/inkling-internal/html/headless-dom'
import { createTestDom } from '@kobato/inkling/tests/utils/render-live'
import { afterEach, describe, expect, it, vi } from 'vitest'

const blankDocument = () => createTestDom().window.document.implementation.createHTMLDocument('')

describe('resolveHeadlessDom', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an injected dom as-is', async () => {
    const injected = { window: { document: blankDocument() } }

    await expect(resolveHeadlessDom(injected)).resolves.toBe(injected)
  })

  it('prefers an injected dom over a global window', async () => {
    const globalDocument = blankDocument()
    vi.stubGlobal('window', { document: globalDocument })
    const injected = { window: { document: blankDocument() } }

    await expect(resolveHeadlessDom(injected)).resolves.toBe(injected)
  })

  it('wraps the global window when nothing is injected', async () => {
    const globalWindow = { document: blankDocument() }
    vi.stubGlobal('window', globalWindow)

    const resolved = await resolveHeadlessDom()

    expect(resolved.window).toBe(globalWindow)
  })

  it.each([new Error("Cannot find package 'jsdom'"), new TypeError('boom')])(
    'rejects with the named error when the jsdom load fails: %s',
    async (cause) => {
      vi.stubGlobal('window', undefined)

      const rejected: unknown = await resolveHeadlessDom(undefined, () => Promise.reject(cause)).catch(
        (error: unknown) => error,
      )

      expect(rejected).toBeInstanceOf(Error)
      expect((rejected as Error).message).toBe(HEADLESS_DOM_MISSING_MESSAGE)
      expect((rejected as Error).cause).toBe(cause)
    },
  )

  it('loads the default dom once and caches it process-wide', async () => {
    vi.stubGlobal('window', undefined)
    const loaded = { window: { document: blankDocument() } }
    const load = vi.fn(async () => loaded)

    await expect(resolveHeadlessDom(undefined, load)).resolves.toBe(loaded)
    const other = { window: { document: blankDocument() } }
    await expect(
      resolveHeadlessDom(
        undefined,
        vi.fn(async () => other),
      ),
    ).resolves.toBe(loaded)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
