import { bundledLanguages, createHighlighter } from 'shiki'

import type {
  InklingCodeBlockNode,
  InklingDocument,
  InklingInlineMathNode,
  InklingMathBlockNode,
} from '@/shared/inkling/schema'

import { getLogger } from '@/server/infra/logger'
import { getKatexRenderer, type KatexRenderer } from '@/server/infra/pt/katex-renderer'
import { SHIKI_THEMES, shikiTransformers } from '@/server/infra/pt/shiki'
import { HIGHLIGHT_LANGUAGES } from '@/shared/constants/languages'
import { walkInkling } from '@/shared/inkling/walk'

const log = getLogger('inkling.prerender')

interface CollectCtx {
  codeBlocks: InklingCodeBlockNode[]
  mathBlocks: InklingMathBlockNode[]
  inlineMath: InklingInlineMathNode[]
  insideTableCell: boolean
}

function collectRenderableNodes(document: InklingDocument): CollectCtx {
  const ctx: CollectCtx = {
    codeBlocks: [],
    mathBlocks: [],
    inlineMath: [],
    insideTableCell: false,
  }

  walkInkling(
    document,
    {
      code: (node, c) => {
        if (node.code !== '') {
          c.codeBlocks.push(node)
        }
      },
      mathBlock: (node, c) => {
        if (node.tex !== '') {
          c.mathBlocks.push(node)
        }
      },
      inlineMath: (node, c) => {
        if (!c.insideTableCell && node.tex !== '') {
          c.inlineMath.push(node)
        }
      },
      tableCell: (_node, c, walkChildren) => {
        const previous = c.insideTableCell
        c.insideTableCell = true
        walkChildren()
        c.insideTableCell = previous
      },
    },
    ctx,
  )

  return ctx
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
        // Log only metadata, never user-authored code.  Shiki parse
        // errors can include source excerpts, which would violate the
        // privacy-logging rules (L4 user content must not be logged).
        log.warn('shiki pass failed for block', {
          language: typeof block.language === 'string' ? block.language : 'text',
          errName: err instanceof Error ? err.name : undefined,
        })
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
        // Leave mathml unset; renderer will fall back to raw tex.
        // Log only error name, never the message — KaTeX parse errors
        // include TeX source snippets (L4 user content).
        log.warn('katex block render failed', {
          errName: err instanceof Error ? err.name : undefined,
          blockKind: 'math-block',
        })
      }
    }),
    ...inlines.map(async (inline) => {
      try {
        inline.mathml = await renderer.render(inline.tex, false)
      } catch (err) {
        // Leave mathml unset.
        // Log only error name, never the message (see block variant above).
        log.warn('katex inline render failed', {
          errName: err instanceof Error ? err.name : undefined,
          blockKind: 'inline-math',
        })
      }
    }),
  ])
}

/**
 * Save-time prerender for an Inkling document. Returns a deep copy with
 * `highlightedHtml` and `mathml` artifacts populated for code blocks, math
 * blocks, and inline math nodes. Any stale artifacts are overwritten so that
 * changes to source text or language are always reflected in the stored output.
 *
 * Table cells are treated as inline-only: any inline math nested inside a cell
 * is intentionally skipped so the dialect stays consistent with the table guard
 * and the historical PT prerender behavior. Recursive containers (solution,
 * twoColumn, footnoteDefinition) are fully traversed. No `svg` field is created.
 */
export async function prerenderInklingDocument(document: InklingDocument): Promise<InklingDocument> {
  // `structuredClone` is available in Node 18+ and gives us a clean immutable
  // copy; collected node references still point into the clone, so in-place
  // mutation affects only the returned document.
  const clone = structuredClone(document) as InklingDocument
  const ctx = collectRenderableNodes(clone)

  if (ctx.codeBlocks.length === 0 && ctx.mathBlocks.length === 0 && ctx.inlineMath.length === 0) {
    return clone
  }

  await Promise.all([runShikiPasses(ctx.codeBlocks), runKatexPasses(ctx.mathBlocks, ctx.inlineMath)])

  return clone
}
