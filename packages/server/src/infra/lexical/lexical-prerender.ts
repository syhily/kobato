import type { LexicalEditorState, LexicalNodeJson } from '@kobato/inkling/headless/schema'

import { visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { KATEX_OPTIONS } from '@kobato/server/infra/lexical/katex'
import {
  SHIKI_SUPPORTED_LANGUAGES,
  SHIKI_THEMES,
  createShikiHighlighter,
  shikiTransformers,
} from '@kobato/server/infra/lexical/shiki'
import { getLogger } from '@kobato/server/infra/logger'
import { createPromiseMemo } from '@kobato/utils/memo'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import katex from 'katex'

const log = getLogger('lexical.prerender')

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
