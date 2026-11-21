import { HIGHLIGHT_LANGUAGES } from '@kobato/assets/highlight-languages'
import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from '@shikijs/transformers'
import { createHighlighter } from 'shiki/bundle/full'

export const shikiTransformers = () => [
  transformerNotationDiff({ matchAlgorithm: 'v3' }),
  transformerNotationHighlight({ matchAlgorithm: 'v3' }),
  transformerNotationWordHighlight({ matchAlgorithm: 'v3' }),
  transformerNotationFocus({ matchAlgorithm: 'v3' }),
  transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
]

export const SHIKI_THEMES = {
  light: 'solarized-light',
  dark: 'solarized-dark',
} as const

export const SHIKI_SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(HIGHLIGHT_LANGUAGES)

export function createShikiHighlighter() {
  return createHighlighter({
    langs: [...HIGHLIGHT_LANGUAGES],
    themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
  })
}
