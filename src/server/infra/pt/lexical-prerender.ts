import katex from 'katex'

import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { getLogger } from '@/server/infra/logger'
import { KATEX_OPTIONS } from '@/server/infra/pt/katex'
import {
  SHIKI_SUPPORTED_LANGUAGES,
  SHIKI_THEMES,
  createShikiHighlighter,
  shikiTransformers,
} from '@/server/infra/pt/shiki'
import { visitLexicalNodes } from '@/shared/lexical/walk'
import { createPromiseMemo } from '@/shared/utils/memo'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('pt.lexical-prerender')

// Lexical counterpart of `prerenderPortableTextBody` (same module's
// `prerender.ts`): fills the host-owned artifact slots at save time so SSR
// never pays the Shiki/KaTeX bootstrap. Mutates in place. Only EMPTY slots
// are recomputed — canonicalize strips client-supplied artifacts first, so
// a filled slot here is always server-computed. `svg` is legacy and never
// recomputed (PT parity): it stays stripped.

interface MathNodeView extends LexicalNodeJson {
  tex: string
  mathml: string
  svg: string
}

interface CodeblockNodeView extends LexicalNodeJson {
  code: string
  language: string
  highlightedHtml: string
}

export async function prerenderLexicalEditorState(state: LexicalEditorState): Promise<LexicalEditorState> {
  const mathBlocks: MathNodeView[] = []
  const mathInlines: MathNodeView[] = []
  const codeblocks: CodeblockNodeView[] = []

  visitLexicalNodes(state, (node) => {
    if (node.type === 'math' || node.type === 'math-inline') {
      // The schema pins tex/mathml/svg as required strings on both math variants.
      const view = unsafeCast<MathNodeView>(node)
      if (view.tex !== '' && view.mathml === '') {
        if (node.type === 'math') {
          mathBlocks.push(view)
        } else {
          mathInlines.push(view)
        }
      }
      return
    }
    if (node.type === 'codeblock') {
      // Same story: code/language/highlightedHtml are required on codeblock nodes.
      const view = unsafeCast<CodeblockNodeView>(node)
      if (view.code !== '' && view.highlightedHtml === '') {
        codeblocks.push(view)
      }
    }
  })

  if (mathBlocks.length === 0 && mathInlines.length === 0 && codeblocks.length === 0) {
    return state
  }

  runKatexPasses(mathBlocks, mathInlines)
  await runShikiPasses(codeblocks)

  return state
}

// Process-wide singleton; single-flight, and a failed bootstrap is retried on the next save.
const getShikiHighlighter = createPromiseMemo(() => createShikiHighlighter())

async function runShikiPasses(blocks: CodeblockNodeView[]): Promise<void> {
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
          lang: block.language !== '' && SHIKI_SUPPORTED_LANGUAGES.has(block.language) ? block.language : 'text',
          themes: SHIKI_THEMES,
          defaultColor: false,
          transformers: shikiTransformers(),
        })
      } catch (err) {
        log.warn('shiki pass failed for codeblock node', { error: String(err) })
      }
    }),
  )
}

function runKatexPasses(blocks: MathNodeView[], inlines: MathNodeView[]): void {
  if (blocks.length === 0 && inlines.length === 0) {
    return
  }
  for (const node of blocks) {
    try {
      node.mathml = katex.renderToString(node.tex, { ...KATEX_OPTIONS, displayMode: true })
    } catch (err) {
      // Leave mathml empty; the renderer falls back to raw TeX.
      log.warn('katex block render failed', { error: String(err) })
    }
  }
  for (const node of inlines) {
    try {
      node.mathml = katex.renderToString(node.tex, { ...KATEX_OPTIONS, displayMode: false })
    } catch (err) {
      log.warn('katex inline render failed', { error: String(err) })
    }
  }
}
