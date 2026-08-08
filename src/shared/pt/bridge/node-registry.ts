/* oxlint-disable typescript/no-unsafe-type-assertion */
import type {
  BridgeEnsureKey,
  BridgeForwardContext,
  BridgeReverseContext,
  PmBlockNode,
  PmNode,
} from '@/shared/pt/bridge/types'
import type {
  Block,
  CodeBlock,
  FootnoteDefinitionBlock,
  HorizontalRuleBlock,
  ImageBlock,
  SolutionBlock,
  TableBlock,
  TextBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'

import { codeBlockToPmNode, pmCodeBlockToBlock } from '@/shared/pt/bridge/nodes/code'
import { footnoteDefinitionBlockToPmNode, pmFootnoteDefinitionToBlocks } from '@/shared/pt/bridge/nodes/footnote'
import { horizontalRuleBlockToPmNode, pmHorizontalRuleToBlock } from '@/shared/pt/bridge/nodes/horizontalRule'
import { imageBlockToPmNode, pmImageToBlock } from '@/shared/pt/bridge/nodes/image'
import { flattenList } from '@/shared/pt/bridge/nodes/list'
import { pmSolutionToBlocks, solutionBlockToPmNode } from '@/shared/pt/bridge/nodes/solution'
import { pmTableToBlock, tableBlockToPmNode } from '@/shared/pt/bridge/nodes/table'
import { paragraphToTextBlock, textBlockToPmNode } from '@/shared/pt/bridge/nodes/text'
import { pmTwoColumnToBlocks, twoColumnBlockToPmNode } from '@/shared/pt/bridge/nodes/twoColumn'
import { isBlock, isInline } from '@/shared/pt/bridge/utils'
import { headingStyleFromLevel } from '@/shared/pt/heading-levels'

// One dispatch table drives BOTH bridge directions; per-node attribute
// knowledge lives in the co-located node modules (`bridge/nodes/*`).
// Adding a node type = one entry + one fixture. `ptType` / `blockToPm`
// are null when the entry only exists for the PM→PT leg.
export interface BridgeNodeEntry {
  /** PM node type claimed on the PM→PT leg. */
  readonly pmType: string
  /** PT block `_type` claimed on the PT→PM leg (`null` = reverse-only). */
  readonly ptType: Block['_type'] | null
  /** PT→PM converter (`null` when `ptType` is null). */
  readonly blockToPm: ((block: Block, ctx: BridgeForwardContext) => PmBlockNode) | null
  /** PM→PT converter; pushes the converted block(s) onto `out`. */
  readonly pmToBlocks: (node: PmBlockNode, out: Block[], ctx: BridgeReverseContext) => void
}

// PortableText flattens: no "nested under blockquote" container —
// paragraphs adopt the quote style; other children flow back through
// the registry dispatch so their content survives.
function pmBlockquoteToBlocks(node: PmBlockNode, out: Block[], ctx: BridgeReverseContext): void {
  const textAlign = node.attrs?.textAlign as string | undefined
  for (const child of (node.content ?? []).filter(isBlock)) {
    if (child.type === 'paragraph') {
      out.push(
        paragraphToTextBlock(
          { ...child, attrs: { ...child.attrs, ...(textAlign ? { textAlign } : {}) } },
          ctx.ensureKey,
          'blockquote',
        ),
      )
    } else if (child.type === 'bulletList' || child.type === 'orderedList') {
      flattenList(child, out, ctx.ensureKey, 1)
    } else {
      ctx.pushPmNode(out, child)
    }
  }
}

// Pass-through for PT blocks without a dedicated editor node; Tiptap
// renders them via the "block-card" view reading `attrs.payload`.
function customBlockToPmNode(block: Block): PmBlockNode {
  return {
    type: 'blockCard',
    attrs: { _key: block._key, _ptType: block._type, payload: block },
  }
}

function pmBlockCardToBlocks(node: PmBlockNode, out: Block[]): void {
  const payload = node.attrs?.payload
  if (payload && typeof payload === 'object' && '_type' in payload) {
    out.push(payload as Block)
  }
}

export const BRIDGE_NODE_REGISTRY: readonly BridgeNodeEntry[] = [
  {
    pmType: 'paragraph',
    ptType: 'block',
    blockToPm: (block) => textBlockToPmNode(block as TextBlock, false),
    pmToBlocks: (node, out, ctx) => {
      out.push(paragraphToTextBlock(node, ctx.ensureKey, 'normal'))
    },
  },
  {
    pmType: 'heading',
    ptType: null,
    blockToPm: null,
    pmToBlocks: (node, out, ctx) => {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      out.push(paragraphToTextBlock(node, ctx.ensureKey, headingStyleFromLevel(level)))
    },
  },
  {
    pmType: 'blockquote',
    ptType: null,
    blockToPm: null,
    pmToBlocks: pmBlockquoteToBlocks,
  },
  {
    pmType: 'bulletList',
    ptType: null,
    blockToPm: null,
    pmToBlocks: (node, out, ctx) => flattenList(node, out, ctx.ensureKey, 1),
  },
  {
    pmType: 'orderedList',
    ptType: null,
    blockToPm: null,
    pmToBlocks: (node, out, ctx) => flattenList(node, out, ctx.ensureKey, 1),
  },
  {
    pmType: 'image',
    ptType: 'image',
    blockToPm: (block) => imageBlockToPmNode(block as ImageBlock),
    pmToBlocks: (node, out, ctx) => {
      out.push(pmImageToBlock(node, ctx.ensureKey))
    },
  },
  {
    pmType: 'codeBlock',
    ptType: 'code',
    blockToPm: (block) => codeBlockToPmNode(block as CodeBlock),
    pmToBlocks: (node, out, ctx) => {
      out.push(pmCodeBlockToBlock(node, ctx.ensureKey))
    },
  },
  {
    pmType: 'horizontalRule',
    ptType: 'horizontalRule',
    blockToPm: (block) => horizontalRuleBlockToPmNode(block as HorizontalRuleBlock),
    pmToBlocks: (node, out, ctx) => {
      out.push(pmHorizontalRuleToBlock(node, ctx.ensureKey))
    },
  },
  {
    pmType: 'table',
    ptType: 'table',
    blockToPm: (block) => tableBlockToPmNode(block as TableBlock),
    pmToBlocks: (node, out, ctx) => {
      out.push(pmTableToBlock(node, ctx.ensureKey))
    },
  },
  {
    pmType: 'solution',
    ptType: 'solution',
    blockToPm: (block, ctx) => solutionBlockToPmNode(block as SolutionBlock, ctx.pushBlocks),
    pmToBlocks: pmSolutionToBlocks,
  },
  {
    pmType: 'twoColumn',
    ptType: 'twoColumn',
    blockToPm: (block, ctx) => twoColumnBlockToPmNode(block as TwoColumnBlock, ctx.pushBlocks),
    pmToBlocks: pmTwoColumnToBlocks,
  },
  {
    pmType: 'footnoteDefinition',
    ptType: 'footnoteDefinition',
    blockToPm: (block, ctx) => footnoteDefinitionBlockToPmNode(block as FootnoteDefinitionBlock, ctx.pushBlocks),
    pmToBlocks: pmFootnoteDefinitionToBlocks,
  },
  {
    pmType: 'blockCard',
    ptType: null,
    blockToPm: null,
    pmToBlocks: pmBlockCardToBlocks,
  },
]

const forwardByPtType = new Map<Block['_type'], BridgeNodeEntry>()
const reverseByPmType = new Map<string, BridgeNodeEntry>()
for (const entry of BRIDGE_NODE_REGISTRY) {
  if (entry.ptType !== null && entry.blockToPm !== null) {
    forwardByPtType.set(entry.ptType, entry)
  }
  reverseByPmType.set(entry.pmType, entry)
}

/** PT→PM dispatch; block types without a dedicated entry fall back to the generic `blockCard` pass-through. */
export function dispatchBlockToPm(block: Block, ctx: BridgeForwardContext): PmBlockNode {
  const entry = forwardByPtType.get(block._type)
  if (entry?.blockToPm != null) {
    return entry.blockToPm(block, ctx)
  }
  return customBlockToPmNode(block)
}

/**
 * PM→PT dispatch. Unknown PM node types throw — silently dropping
 * authored content on the save path is never acceptable. Stray
 * top-level inline text is ignored.
 */
export function dispatchPmNodeToBlocks(out: Block[], node: PmNode, ensureKey: BridgeEnsureKey): void {
  if (isInline(node)) {
    return
  }
  const entry = reverseByPmType.get(node.type)
  if (entry === undefined) {
    throw new Error(`pt-bridge: cannot save — no converter registered for PM node type "${node.type}"`)
  }
  entry.pmToBlocks(node, out, {
    ensureKey,
    pushPmNode: (target, child) => dispatchPmNodeToBlocks(target, child, ensureKey),
  })
}
