import { DEFAULT_INKLING_VERSION, isLegacyVersion, slugify } from '@kobato/inkling-internal/utils'
import { createHeadingIdTracker } from '@kobato/inkling-internal/utils/heading-id-tracker'
import MarkdownIt, {
  type Env,
  type MarkdownIt as MarkdownItInstance,
  type MarkdownItOptions,
  type Renderer,
  type Token,
} from 'markdown-it'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItLazyHeaders from 'markdown-it-lazy-headers'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
const renderers: Partial<Record<'<4.x' | 'latest', MarkdownItInstance>> = {}
interface RenderOptions {
  inklingVersion?: string
}

function isHeadingIdTracker(value: unknown): value is (base: string) => string {
  return typeof value === 'function'
}

const namedHeaders = function ({ inklingVersion }: RenderOptions = {}) {
  return function (md: MarkdownItInstance) {
    const originalHeadingOpen = md.renderer.rules.heading_open

    md.renderer.rules.heading_open = function (
      tokens: Token[],
      idx: number,
      options: Required<MarkdownItOptions>,
      env: Env | undefined,
      self: Renderer,
    ) {
      const envBag: Env = env ?? {}
      let trackHeadingId: (base: string) => string
      if (isHeadingIdTracker(envBag.headingIdTracker)) {
        trackHeadingId = envBag.headingIdTracker
      } else {
        trackHeadingId = createHeadingIdTracker()
        envBag.headingIdTracker = trackHeadingId
      }

      const attrs = tokens[idx].attrs || []
      tokens[idx].attrs = attrs

      const title = (tokens[idx + 1].children ?? []).reduce(function (acc: string, t: Token) {
        return acc + t.content
      }, '')
      const slug = trackHeadingId(slugify(title, { inklingVersion, type: 'markdown' }))
      attrs.push(['id', slug])
      if (originalHeadingOpen) {
        return originalHeadingOpen.call(this, tokens, idx, options, env, self)
      }
      return self.renderToken(tokens, idx, options)
    }
  }
}

function lazyLoadingImages(md: MarkdownItInstance): void {
  const defaultImageRenderer = md.renderer.rules.image
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('loading', 'lazy')
    return defaultImageRenderer
      ? defaultImageRenderer(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }
}

const selectRenderer = function (options: RenderOptions): MarkdownItInstance {
  const key = isLegacyVersion(options.inklingVersion || DEFAULT_INKLING_VERSION) ? '<4.x' : 'latest'
  if (renderers[key]) {
    return renderers[key]
  }

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

function render(markdown: string, options: RenderOptions = {}): string {
  return selectRenderer(options).render(markdown)
}
export const pasteDialect = { render }
