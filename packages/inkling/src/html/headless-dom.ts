import type { ExportDOMDom } from '@kobato/inkling-internal/nodes/base'

export const HEADLESS_DOM_MISSING_MESSAGE =
  'inkling headless HTML conversion needs a DOM: pass options.dom or run where a global ' +
  'window.document exists — the jsdom fallback failed to load, which means this bundle/environment ' +
  "is broken (jsdom is a plain bundled dependency, inlined into the SEA binary), not that 'jsdom' " +
  'needs installing'

type LoadJsdom = () => Promise<ExportDOMDom>

const loadJsdom: LoadJsdom = async () => {
  const { JSDOM } = await import('jsdom')
  return new JSDOM()
}

let cachedDefaultDom: Promise<ExportDOMDom> | undefined

export async function resolveHeadlessDom(injected?: ExportDOMDom, load: LoadJsdom = loadJsdom): Promise<ExportDOMDom> {
  if (injected) {
    return injected
  }

  const browserWindow = typeof window === 'undefined' ? undefined : window
  if (browserWindow?.document) {
    return { window: browserWindow }
  }

  if (!cachedDefaultDom) {
    const pending = load()
    cachedDefaultDom = pending
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
