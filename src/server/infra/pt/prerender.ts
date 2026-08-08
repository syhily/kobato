import katex from 'katex'

import type { MarkDef, PortableTextBody, TextBlock } from '@/shared/pt/schema'

import { getLogger } from '@/server/infra/logger'
import { KATEX_OPTIONS } from '@/server/infra/pt/katex'
import {
  SHIKI_SUPPORTED_LANGUAGES,
  SHIKI_THEMES,
  createShikiHighlighter,
  shikiTransformers,
} from '@/server/infra/pt/shiki'
import { visitNestedBlocks } from '@/shared/pt/utils'
import { createPromiseMemo } from '@/shared/utils/memo'

const log = getLogger('pt.prerender')

// Pre-render code/math blocks at save time so SSR never pays the Shiki/KaTeX bootstrap; mutates in place.

export async function prerenderPortableTextBody(body: PortableTextBody): Promise<PortableTextBody> {
  const codeBlocks: {
    _type: 'code'
    _key: string
    code: string
    language?: string
    highlightedHtml?: string
  }[] = []
  const mathBlocks: {
    _type: 'mathBlock'
    _key: string
    tex: string
    mathml?: string
    svg?: string
  }[] = []
  const mathInlineDefs: {
    _type: 'mathInline'
    _key: string
    tex: string
    mathml?: string
    svg?: string
  }[] = []

  visitNestedBlocks(body, (block) => {
    if (block._type === 'code') {
      if (block.code !== '' && (block.highlightedHtml === undefined || block.highlightedHtml === '')) {
        codeBlocks.push(block)
      }
      return
    }
    if (block._type === 'mathBlock') {
      if (block.tex !== '' && (block.mathml === undefined || block.mathml === '')) {
        mathBlocks.push(block)
      }
      return
    }
    if (block._type === 'block') {
      // Only text blocks can carry inline math marks.
      collectFromTextBlock(block, mathInlineDefs)
    }
  })

  if (codeBlocks.length === 0 && mathBlocks.length === 0 && mathInlineDefs.length === 0) {
    return body
  }

  runKatexPasses(mathBlocks, mathInlineDefs)
  await runShikiPasses(codeBlocks)

  return body
}

function collectFromTextBlock(
  block: TextBlock,
  mathInlineDefs: { _type: 'mathInline'; tex: string; mathml?: string; svg?: string }[],
): void {
  if (!Array.isArray(block.markDefs)) {
    return
  }
  for (const def of block.markDefs as MarkDef[]) {
    if (def._type === 'mathInline' && def.tex !== '' && (def.mathml === undefined || def.mathml === '')) {
      mathInlineDefs.push(def)
    }
  }
}

// Process-wide singleton; single-flight, and a failed bootstrap is retried on the next save.
const getShikiHighlighter = createPromiseMemo(() => createShikiHighlighter())

async function runShikiPasses(blocks: { code: string; language?: string; highlightedHtml?: string }[]): Promise<void> {
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
        block.highlightedHtml = highlighter.codeToHtml(block.code, {
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

function runKatexPasses(blocks: { tex: string; mathml?: string }[], inlines: { tex: string; mathml?: string }[]): void {
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
  for (const def of inlines) {
    try {
      def.mathml = katex.renderToString(def.tex, { ...KATEX_OPTIONS, displayMode: false })
    } catch (err) {
      log.warn('katex inline render failed', { error: String(err) })
    }
  }
}
