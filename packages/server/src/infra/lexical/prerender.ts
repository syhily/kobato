import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { getLogger } from '@kobato/server/infra/logger'
import { KATEX_OPTIONS } from '@kobato/server/infra/markup/katex'
import {
  SHIKI_SUPPORTED_LANGUAGES,
  SHIKI_THEMES,
  createShikiHighlighter,
  shikiTransformers,
} from '@kobato/server/infra/markup/shiki'
import { visitLexicalNodes } from '@kobato/shared/lexical/walk'
import { createPromiseMemo } from '@kobato/shared/utils/memo'
import katex from 'katex'

const log = getLogger('lexical.prerender')

// Pre-render heavy Lexical blocks (code, math) at save time so SSR
// doesn't pay the Shiki/KaTeX bootstrap cost on every request — the
// Lexical twin of `prerenderPortableTextBody` (`@/server/infra/pt/prerender`).
// Mutates in place: `code` gains `highlightedHtml` (Shiki), `mathBlock` /
// `mathInline` gain `mathml` (KaTeX). Only missing fields are recomputed —
// a block that already carries its artifact passes through untouched, and
// a body with nothing to pre-render returns without touching the Shiki /
// KaTeX singletons (the hot path).

interface MutableCodeLike {
  type: 'code'
  language?: string
  highlightedHtml?: string
  children: { text: string }[]
}

interface MutableMathLike {
  tex: string
  mathml?: string
}

export async function prerenderLexicalBody(body: LexicalBody): Promise<LexicalBody> {
  const codeBlocks: MutableCodeLike[] = []
  const mathBlocks: MutableMathLike[] = []
  const mathInlines: MutableMathLike[] = []

  visitLexicalNodes(body, (node) => {
    if (node.type === 'code') {
      const text = node.children.map((child) => child.text).join('')
      if (text !== '' && (node.highlightedHtml === undefined || node.highlightedHtml === '')) {
        codeBlocks.push(node)
      }
      return
    }
    if (node.type === 'mathBlock') {
      if (node.tex !== '' && (node.mathml === undefined || node.mathml === '')) {
        mathBlocks.push(node)
      }
      return
    }
    if (node.type === 'mathInline') {
      if (node.tex !== '' && (node.mathml === undefined || node.mathml === '')) {
        mathInlines.push(node)
      }
    }
  })

  if (codeBlocks.length === 0 && mathBlocks.length === 0 && mathInlines.length === 0) {
    return body
  }

  runKatexPasses(mathBlocks, mathInlines)
  await runShikiPasses(codeBlocks)

  return body
}

// Process-level singleton shared across saves. Single-flight semantics:
// share-in-flight (concurrent first saves await one bootstrap promise);
// failure: retry (a rejected bootstrap is dropped, a later save re-tries).
const getShikiHighlighter = createPromiseMemo(() => createShikiHighlighter())

async function runShikiPasses(blocks: MutableCodeLike[]): Promise<void> {
  if (blocks.length === 0) {
    return
  }
  let highlighter: Awaited<ReturnType<typeof createShikiHighlighter>>
  try {
    highlighter = await getShikiHighlighter()
  } catch {
    return
  }
  await Promise.all(
    blocks.map(async (block) => {
      try {
        block.highlightedHtml = highlighter.codeToHtml(block.children.map((child) => child.text).join(''), {
          lang:
            typeof block.language === 'string' && block.language !== '' && SHIKI_SUPPORTED_LANGUAGES.has(block.language)
              ? block.language
              : 'text',
          themes: SHIKI_THEMES,
          defaultColor: false,
          transformers: shikiTransformers(),
        })
      } catch (err) {
        log.warn('shiki pass failed for block', { error: String(err) })
      }
    }),
  )
}

function runKatexPasses(blocks: MutableMathLike[], inlines: MutableMathLike[]): void {
  if (blocks.length === 0 && inlines.length === 0) {
    return
  }
  for (const block of blocks) {
    try {
      block.mathml = katex.renderToString(block.tex, { ...KATEX_OPTIONS, displayMode: true })
    } catch (err) {
      // Leave mathml unset; renderer will fall back to legacy SVG or raw text.
      log.warn('katex block render failed', { error: String(err) })
    }
  }
  for (const inline of inlines) {
    try {
      inline.mathml = katex.renderToString(inline.tex, { ...KATEX_OPTIONS, displayMode: false })
    } catch (err) {
      // Leave mathml unset.
      log.warn('katex inline render failed', { error: String(err) })
    }
  }
}
