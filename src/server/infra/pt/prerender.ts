import { bundledLanguages, createHighlighter } from 'shiki'

import type { Block, MarkDef, PortableTextBody, TextBlock } from '@/shared/pt/schema'

import { getLogger } from '@/server/infra/logger'
import { getKatexRenderer, type KatexRenderer } from '@/server/infra/pt/katex-renderer'
import { SHIKI_THEMES, shikiTransformers } from '@/server/infra/pt/shiki'
import { HIGHLIGHT_LANGUAGES } from '@/shared/constants/languages'

const log = getLogger('pt.prerender')

// Pre-render heavy PT blocks (code, math) at save time so SSR doesn't pay
// the Shiki/KaTeX bootstrap cost on every request. Mutates in place.

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

  for (const block of body) {
    collectBlock(block, codeBlocks, mathBlocks, mathInlineDefs)
  }

  // Hot path: skip when no math/code blocks need pre-rendering.
  if (codeBlocks.length === 0 && mathBlocks.length === 0 && mathInlineDefs.length === 0) {
    return body
  }

  await Promise.all([runShikiPasses(codeBlocks), runKatexPasses(mathBlocks, mathInlineDefs)])

  return body
}

function collectBlock(
  block: Block,
  codeBlocks: { _type: 'code'; code: string; language?: string; highlightedHtml?: string }[],
  mathBlocks: { _type: 'mathBlock'; tex: string; mathml?: string; svg?: string }[],
  mathInlineDefs: { _type: 'mathInline'; tex: string; mathml?: string; svg?: string }[],
): void {
  switch (block._type) {
    case 'code':
      if (block.code !== '' && (block.highlightedHtml === undefined || block.highlightedHtml === '')) {
        codeBlocks.push(block)
      }
      return
    case 'mathBlock':
      if (block.tex !== '' && (block.mathml === undefined || block.mathml === '')) {
        mathBlocks.push(block)
      }
      return
    case 'block': {
      collectFromTextBlock(block, mathInlineDefs)
      return
    }
    case 'solution':
    case 'footnoteDefinition':
      if (Array.isArray(block.children)) {
        for (const child of block.children) {
          collectBlock(child as Block, codeBlocks, mathBlocks, mathInlineDefs)
        }
      }
      return
    case 'twoColumn':
      for (const child of block.left) {
        collectBlock(child as Block, codeBlocks, mathBlocks, mathInlineDefs)
      }
      for (const child of block.right) {
        collectBlock(child as Block, codeBlocks, mathBlocks, mathInlineDefs)
      }
      return
    case 'table':
      // Explicit no-op: tables don't contain nested code/math.
      return
    case 'horizontalRule':
    case 'image':
    case 'musicPlayer':
      return
  }
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

// Process-level singleton: shared across saves; concurrent first-save
// requests share the same in-flight bootstrap promise.
let shikiHighlighterPromise: ReturnType<typeof createHighlighter> | null = null

function getShikiHighlighter(): ReturnType<typeof createHighlighter> {
  if (shikiHighlighterPromise === null) {
    shikiHighlighterPromise = createHighlighter({
      langs: HIGHLIGHT_LANGUAGES.filter((lang) => lang in bundledLanguages),
      themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
    }).catch((err) => {
      // Reset so a later save can retry instead of poisoning the cache.
      shikiHighlighterPromise = null
      throw err
    })
  }
  return shikiHighlighterPromise
}

async function runShikiPasses(blocks: { code: string; language?: string; highlightedHtml?: string }[]): Promise<void> {
  if (blocks.length === 0) {
    return
  }
  let highlighter: Awaited<ReturnType<typeof createHighlighter>>
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
            typeof block.language === 'string' && block.language !== '' && block.language in bundledLanguages
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

async function runKatexPasses(
  blocks: { tex: string; mathml?: string }[],
  inlines: { tex: string; mathml?: string }[],
): Promise<void> {
  if (blocks.length === 0 && inlines.length === 0) {
    return
  }
  let renderer: KatexRenderer
  try {
    renderer = await getKatexRenderer()
  } catch {
    return
  }
  await Promise.all([
    ...blocks.map(async (block) => {
      try {
        block.mathml = await renderer.render(block.tex, true)
      } catch (err) {
        // Leave mathml unset; renderer will fall back to legacy SVG or raw text.
        log.warn('katex block render failed', { error: String(err) })
      }
    }),
    ...inlines.map(async (def) => {
      try {
        def.mathml = await renderer.render(def.tex, false)
      } catch (err) {
        // Leave mathml unset.
        log.warn('katex inline render failed', { error: String(err) })
      }
    }),
  ])
}
