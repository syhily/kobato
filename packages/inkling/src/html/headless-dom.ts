import type { ExportDOMDom } from '@/nodes/base'

export const HEADLESS_DOM_MISSING_MESSAGE =
  '@inkling/editor headless HTML conversion needs a DOM: pass options.dom, run where a global ' +
  "window.document exists, or install the optional 'jsdom' peer dependency"

type LoadJsdom = () => Promise<ExportDOMDom>

const loadJsdom: LoadJsdom = async () => {
  const { JSDOM } = await import('jsdom')
  return new JSDOM()
}

let cachedDefaultDom: Promise<ExportDOMDom> | undefined

/**
 * The headless DOM port — the only module in the package that knows jsdom
 * (an import guard enforces it). Resolves the DOM for one headless
 * conversion: an injected `options.dom` wins, then a global
 * `window.document` (mirroring the render context's createDocument chain),
 * then a lazily imported, process-cached JSDOM — the class-level cache the
 * renderer used to carry, moved here. The jsdom loader hides behind the
 * `load` injection port so the failure leg is a synchronous test table with
 * no module mocking: any loader failure is rethrown as the named error.
 *
 * The cache stores the load PROMISE, not the resolved DOM, so concurrent
 * first calls share one JSDOM construction instead of racing into several.
 * A failed load clears the cache again — failures never populate it, so a
 * later call retries (and can succeed) instead of rethrowing a cached
 * rejection.
 */
export async function resolveHeadlessDom(injected?: ExportDOMDom, load: LoadJsdom = loadJsdom): Promise<ExportDOMDom> {
  if (injected) {
    return injected
  }

  if (typeof window !== 'undefined' && window.document) {
    // The REAL global window, not a fabricated {document} shell — the render
    // context binds DOMPurify to options.dom.window downstream, and a
    // structural fake is not a bindable window.
    return { window }
  }

  if (!cachedDefaultDom) {
    const pending = load()
    cachedDefaultDom = pending
    // Clear the cache on failure so the failure leg never poisons later
    // resolutions; the identity guard skips the clear if a newer load has
    // already replaced this promise.
    pending.catch(() => {
      if (cachedDefaultDom === pending) {
        cachedDefaultDom = undefined
      }
    })
  }

  try {
    return await cachedDefaultDom
  } catch (error) {
    throw new Error(HEADLESS_DOM_MISSING_MESSAGE, { cause: error })
  }
}
