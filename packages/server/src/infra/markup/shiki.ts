import { HIGHLIGHT_LANGUAGES } from '@kobato/shared/constants/languages'
import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from '@shikijs/transformers'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import bash from 'shiki/langs/bash.mjs'
import c from 'shiki/langs/c.mjs'
import cpp from 'shiki/langs/cpp.mjs'
import csharp from 'shiki/langs/csharp.mjs'
import css from 'shiki/langs/css.mjs'
import dart from 'shiki/langs/dart.mjs'
import diff from 'shiki/langs/diff.mjs'
import go from 'shiki/langs/go.mjs'
import html from 'shiki/langs/html.mjs'
import http from 'shiki/langs/http.mjs'
import java from 'shiki/langs/java.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import json from 'shiki/langs/json.mjs'
import jsx from 'shiki/langs/jsx.mjs'
import kotlin from 'shiki/langs/kotlin.mjs'
import lua from 'shiki/langs/lua.mjs'
import markdown from 'shiki/langs/markdown.mjs'
import objectiveC from 'shiki/langs/objective-c.mjs'
import php from 'shiki/langs/php.mjs'
import powershell from 'shiki/langs/powershell.mjs'
import python from 'shiki/langs/python.mjs'
import ruby from 'shiki/langs/ruby.mjs'
import rust from 'shiki/langs/rust.mjs'
import scala from 'shiki/langs/scala.mjs'
import scss from 'shiki/langs/scss.mjs'
import shell from 'shiki/langs/shell.mjs'
import sql from 'shiki/langs/sql.mjs'
import svelte from 'shiki/langs/svelte.mjs'
import swift from 'shiki/langs/swift.mjs'
import tex from 'shiki/langs/tex.mjs'
import toml from 'shiki/langs/toml.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import vue from 'shiki/langs/vue.mjs'
import xml from 'shiki/langs/xml.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import solarizedDark from 'shiki/themes/solarized-dark.mjs'
import solarizedLight from 'shiki/themes/solarized-light.mjs'

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

// Fine-grained Shiki wiring (replacing the full `shiki` bundle — importing
// `shiki` costs ~10 MB of server bundle in grammars/themes nothing here
// uses). The 36 language modules below mirror `HIGHLIGHT_LANGUAGES`
// one-to-one (keep them in sync — `SHIKI_SUPPORTED_LANGUAGES` derives the
// runtime gate from the same list). Each module registers its embedded
// grammars alongside (vue pulls html/css/js, ruby pulls haml/yaml, tex
// pulls r, …), so embedded-language highlighting behaves exactly like the
// full bundle. The Oniguruma engine's wasm arrives as base64-inlined JS
// (`shiki/wasm` → @shikijs/engine-oniguruma/wasm-inlined) — plain bundle
// content, no separate asset, identical to what the full bundle shipped.
const SHIKI_LANGUAGE_MODULES = [
  bash,
  shell,
  powershell,
  diff,
  http,
  html,
  css,
  scss,
  javascript,
  typescript,
  jsx,
  tsx,
  vue,
  svelte,
  python,
  java,
  kotlin,
  go,
  rust,
  c,
  cpp,
  csharp,
  php,
  ruby,
  swift,
  objectiveC,
  scala,
  dart,
  lua,
  json,
  yaml,
  toml,
  xml,
  sql,
  markdown,
  tex,
]

const SHIKI_THEME_MODULES = [solarizedLight, solarizedDark]

/**
 * Lookup view of `HIGHLIGHT_LANGUAGES` for the prerender runtime gate —
 * equivalent to the previous `block.language in bundledLanguages` check
 * (all 36 names are full-bundle grammars or aliases, verified). A future
 * shiki release that drops one now fails at BUILD time (the static import
 * breaks) instead of silently degrading to plain text.
 */
export const SHIKI_SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(HIGHLIGHT_LANGUAGES)

/**
 * Create the project's Shiki highlighter: the 36 explicit language
 * registrations + the two solarized themes, on the Oniguruma engine (the
 * exact wiring the full bundle's `createHighlighter` used). Callers wrap
 * this in their own lazy singleton (`createPromiseMemo`) — shiki memoizes
 * the wasm init process-wide, so each singleton only re-registers
 * grammars.
 */
export function createShikiHighlighter() {
  return createHighlighterCore({
    langs: SHIKI_LANGUAGE_MODULES,
    themes: SHIKI_THEME_MODULES,
    engine: createOnigurumaEngine(import('shiki/wasm')),
  })
}
