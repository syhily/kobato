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

import { HIGHLIGHT_LANGUAGES } from '@/shared/constants/languages'

export const shikiTransformers = () => [
  transformerNotationDiff({ matchAlgorithm: 'v3' }),
  transformerNotationHighlight({ matchAlgorithm: 'v3' }),
  transformerNotationWordHighlight({ matchAlgorithm: 'v3' }),
  transformerNotationFocus({ matchAlgorithm: 'v3' }),
  transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
]

// Dual-theme: `defaultColor: false` emits both `--shiki-light` and
// `--shiki-dark` vars; the solarized pair matches the palette one-to-one.
export const SHIKI_THEMES = {
  light: 'solarized-light',
  dark: 'solarized-dark',
} as const

// Fine-grained wiring: the 36 modules below mirror `HIGHLIGHT_LANGUAGES`
// one-to-one (keep in sync); wasm arrives base64-inlined, so there is no
// separate asset.
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
 * Lookup view of `HIGHLIGHT_LANGUAGES`; a shiki release dropping a grammar
 * fails at build time instead of silently degrading to plain text.
 */
export const SHIKI_SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(HIGHLIGHT_LANGUAGES)

/**
 * The 36 languages + two solarized themes on the Oniguruma engine.
 * Callers wrap this in their own lazy singleton (`createPromiseMemo`).
 */
export function createShikiHighlighter() {
  return createHighlighterCore({
    langs: SHIKI_LANGUAGE_MODULES,
    themes: SHIKI_THEME_MODULES,
    engine: createOnigurumaEngine(import('shiki/wasm')),
  })
}
