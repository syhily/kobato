import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from '@shikijs/transformers'

// Shiki transformer list used by the PT prerender highlighting pass
// (`@/server/infra/pt/prerender`) when it pre-renders code blocks to HTML
// at SSR time.
export const shikiTransformers = () => [
  transformerNotationDiff({ matchAlgorithm: 'v3' }),
  transformerNotationHighlight({ matchAlgorithm: 'v3' }),
  transformerNotationWordHighlight({ matchAlgorithm: 'v3' }),
  transformerNotationFocus({ matchAlgorithm: 'v3' }),
  transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
]

// Dual-theme highlighting. With `themes: SHIKI_THEMES` + `defaultColor: false`
// Shiki emits each token with both `--shiki-light` and `--shiki-dark` CSS
// custom properties on the inline `style` attribute; the page CSS then picks
// whichever one corresponds to the active `.dark` class, so the same HTML
// renders correctly in both modes without re-highlighting on theme switch.
// Picking solarized-dark as the pair for solarized-light keeps the token
// palette correspondence one-to-one (base03↔base3, base01↔base1, …).
export const SHIKI_THEMES = {
  light: 'solarized-light',
  dark: 'solarized-dark',
} as const
