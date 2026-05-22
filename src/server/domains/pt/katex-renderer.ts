// Single canonical KaTeX to MathML renderer for the entire blog. Page
// save / publish prerendering and the admin editor preview both flow
// through this module so draft previews and published pages cannot drift.

export interface KatexRenderer {
  render: (tex: string, display: boolean) => Promise<string>
}

import { getOrCreateGlobalSingleton } from '@/server/infra/global-singleton'

const RENDERER_KEY = Symbol.for('yufan.me/markdown/katex-renderer')

export function getKatexRenderer(): Promise<KatexRenderer> {
  return getOrCreateGlobalSingleton(RENDERER_KEY, () => createKatexRenderer())
}

async function createKatexRenderer(): Promise<KatexRenderer> {
  // Lazy-load KaTeX (and the mhchem extension) so the hefty parser stays
  // out of modules that only need the renderer interface. On a typical
  // blog most posts do not contain math, so the chunk is only fetched
  // when the first TeX block is encountered during prerender or preview.
  const [{ default: katex }] = await Promise.all([
    import('katex'),
    // @ts-expect-error katex/contrib/mhchem has no type declarations
    import('katex/contrib/mhchem'),
  ])

  return {
    async render(tex: string, display: boolean): Promise<string> {
      return katex.renderToString(tex, {
        displayMode: display,
        output: 'mathml',
        throwOnError: true,
        trust: false,
      })
    },
  }
}
