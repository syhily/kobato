import { HEADLESS_DOM_MISSING_MESSAGE, resolveHeadlessDom } from '@/html/headless-dom'

// The port's process-level jsdom cache survives across tests in this file,
// so the loader legs are ordered deliberately: the failure table (which
// never populates the cache) runs first, the success/cache case runs last.
describe('resolveHeadlessDom', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an injected dom as-is', async () => {
    const injected = { window: { document: document.implementation.createHTMLDocument('') } }

    await expect(resolveHeadlessDom(injected)).resolves.toBe(injected)
  })

  it('prefers an injected dom over a global window', async () => {
    const globalDocument = document.implementation.createHTMLDocument('')
    vi.stubGlobal('window', { document: globalDocument })
    const injected = { window: { document: document.implementation.createHTMLDocument('') } }

    await expect(resolveHeadlessDom(injected)).resolves.toBe(injected)
  })

  it('wraps the global window when nothing is injected', async () => {
    const globalWindow = { document: document.implementation.createHTMLDocument('') }
    vi.stubGlobal('window', globalWindow)

    const resolved = await resolveHeadlessDom()

    // the real global window object, not a fabricated {document} shell
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
    const loaded = { window: { document: document.implementation.createHTMLDocument('') } }
    const load = vi.fn(async () => loaded)

    await expect(resolveHeadlessDom(undefined, load)).resolves.toBe(loaded)
    // a second resolution must not hit the loader again, even with a new one
    const other = { window: { document: document.implementation.createHTMLDocument('') } }
    await expect(
      resolveHeadlessDom(
        undefined,
        vi.fn(async () => other),
      ),
    ).resolves.toBe(loaded)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
