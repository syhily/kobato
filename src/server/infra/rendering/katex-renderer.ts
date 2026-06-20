import katex from 'katex'
import 'katex/contrib/mhchem'

export interface KatexRenderer {
  render: (tex: string, display: boolean) => Promise<string>
}

let cachedRenderer: KatexRenderer | undefined

export function getKatexRenderer(): Promise<KatexRenderer> {
  cachedRenderer ??= {
    async render(tex: string, display: boolean): Promise<string> {
      return katex.renderToString(tex, {
        displayMode: display,
        output: 'mathml',
        throwOnError: true,
        trust: false,
      })
    },
  }
  return Promise.resolve(cachedRenderer)
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cachedRenderer = undefined
  })
}
