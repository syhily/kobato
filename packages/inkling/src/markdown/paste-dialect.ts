// The paste dialect — one of Inkling's two markdown dialects (the card-aware
// round-trip dialect is `@/markdown/round-trip`). Two pipelines speak it:
// clipboard markdown (the headless `markdownToSanitizedHtml` in
// `@/plugins/behaviour/markdownPaste`, fed into Lexical's HTML import by
// `MarkdownPastePlugin`) and the markdown card's HTML export
// (`@/nodes/base/nodes/markdown/markdown-renderer`).
//
// What the dialect speaks: footnotes, ==mark==, ~sub~, ^sup^ — and no
// card-fence grammar. The inline delimiters are declared once in the shared
// grammar table (`@/markdown/grammar`); the engine — markdown-it with its
// plugin stack, the cached per-slug-policy instances, and the legacy
// `inklingVersion` slug branching — is the module's hidden implementation
// below.
//
// Where the dialects meet: the round-trip dialect's own export does not
// survive this dialect — a pasted ```inkling:*``` fence renders as
// `<pre><code class="language-inkling:*">` and imports as a code block card
// whose language is the fence tag (pinned in
// test/unit/plugins/MarkdownPastePlugin.test.tsx, "paste dialect coverage").
import type { Options } from 'markdown-it'
import type Renderer from 'markdown-it/lib/renderer.mjs'
import type Token from 'markdown-it/lib/token.mjs'

import MarkdownIt from 'markdown-it'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItLazyHeaders from 'markdown-it-lazy-headers'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'

import { DEFAULT_INKLING_VERSION, isLegacyVersion, slugify } from '@/utils'
import { createHeadingIdTracker } from '@/utils/heading-id-tracker'

const renderers: Partial<Record<'<4.x' | 'latest', MarkdownIt>> = {}

interface RenderOptions {
  inklingVersion?: string
}

// The per-render heading-id tracker carried on the markdown-it env: the
// shared dedup policy (`@/utils/heading-id-tracker`) — base id on first
// use, `<base>-<n>` on repeats, the same numbering the HTML renderer's
// `trackIdAttribute` emits.
function isHeadingIdTracker(value: unknown): value is (base: string) => string {
  return typeof value === 'function'
}

const namedHeaders = function ({ inklingVersion }: RenderOptions = {}) {
  return function (md: MarkdownIt) {
    const originalHeadingOpen = md.renderer.rules.heading_open

    // originally from https://github.com/leff/markdown-it-named-headers
    // moved here to avoid pulling in http://stringjs.com dependency
    md.renderer.rules.heading_open = function (
      tokens: Token[],
      idx: number,
      options: Options,
      env: Record<string, unknown>,
      self: Renderer,
    ) {
      // Dedup state must live on the per-render `env` (markdown-it creates a
      // fresh env object for every render() call) — keeping it in a closure
      // would leak heading ids across renders of the cached MarkdownIt
      // instance, while a fresh tracker per heading would never dedupe. The
      // slot is validated rather than asserted: env is caller-controlled, so
      // a foreign value must reset the tracker instead of corrupting it.
      let trackHeadingId: (base: string) => string
      if (isHeadingIdTracker(env.headingIdTracker)) {
        trackHeadingId = env.headingIdTracker
      } else {
        trackHeadingId = createHeadingIdTracker()
        env.headingIdTracker = trackHeadingId
      }

      const attrs = tokens[idx].attrs || []
      tokens[idx].attrs = attrs
      // markdown-it emits heading_open → inline adjacently; children is the
      // inline token's content array
      const title = (tokens[idx + 1].children ?? []).reduce(function (acc: string, t: Token) {
        return acc + t.content
      }, '')
      const slug = trackHeadingId(slugify(title, { inklingVersion, type: 'markdown' }))
      attrs.push(['id', slug])
      if (originalHeadingOpen) {
        return originalHeadingOpen.call(this, tokens, idx, options, env, self)
      } else {
        return self.renderToken(tokens, idx, options)
      }
    }
  }
}

// Pasted images export `loading="lazy"` (the only feature the former
// markdown-it-image-lazy-loading dependency provided — its image-size /
// node:path legs pulled Node built-ins into the browser bundle and were
// never used: the plugin was mounted with no options).
function lazyLoadingImages(md: MarkdownIt): void {
  const defaultImageRenderer = md.renderer.rules.image
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('loading', 'lazy')
    return defaultImageRenderer
      ? defaultImageRenderer(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }
}

const selectRenderer = function (options: RenderOptions): MarkdownIt {
  // The slug policy is fixed by the version, so one cached engine per policy;
  // `namedHeaders(options)` closes over the per-version slug behaviour.
  const key = isLegacyVersion(options.inklingVersion || DEFAULT_INKLING_VERSION) ? '<4.x' : 'latest'
  if (renderers[key]) {
    return renderers[key]
  }
  // markdown-it-mark/sub/sup are this engine's projection of the shared
  // grammar table's inline delimiters (`@/markdown/grammar`'s
  // INLINE_DELIMITERS) — the plugins hardcode ==/~/^, and
  // test/markdown/grammar.test.ts pins the engines agreeing.
  const markdownIt = new MarkdownIt({ html: true, breaks: true, linkify: true })
    .use(markdownItFootnote)
    .use(markdownItLazyHeaders)
    .use(markdownItMark)
    .use(lazyLoadingImages)
    .use(namedHeaders(options))
    .use(markdownItSub)
    .use(markdownItSup)
  markdownIt.linkify.set({ fuzzyLink: false })
  renderers[key] = markdownIt
  return markdownIt
}

/** Render markdown to (unsanitized) HTML through the paste dialect's engine. */
function render(markdown: string, options: RenderOptions = {}): string {
  return selectRenderer(options).render(markdown)
}

/** The paste dialect's single handle (CONTEXT.md: "markdown dialect"). */
export const pasteDialect = { render }
