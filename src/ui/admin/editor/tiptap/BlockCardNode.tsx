import { Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { FunctionSquareIcon, SquarePenIcon, TrashIcon } from 'lucide-react'
import { useState } from 'react'

import type { Block } from '@/shared/pt/schema'

import {
  MathBlockSourceEditor,
  MathBlockSummary,
  mathBlockIcon,
  mathBlockTitle,
  stripMathArtifacts,
} from '@/ui/admin/editor/tiptap/block-cards/MathBlock'
import {
  MusicBlockSummary,
  musicBlockIcon,
  musicBlockTitle,
  MusicPlayerOptions,
  patchMusicPlayerFlag,
} from '@/ui/admin/editor/tiptap/block-cards/MusicBlock'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

// Universal "block card" Tiptap node. The PortableText ↔ ProseMirror
// bridge maps opaque PT custom blocks (`musicPlayer`, `mathBlock`)
// to a single `blockCard` PM node carrying the original PT
// block in `attrs.payload`. **`solution`** uses a dedicated nested PM node
// (`SolutionNode`). **`footnoteDefinition`** is omitted from the admin page
// editor PM doc — see `@/shared/pt/footnote-merge`.
// This Node spec is what makes the editor round-trip
// those blocks safely:
//
// * Without a Node spec, Tiptap silently drops unknown PM nodes, so
//   loading a body with any custom block would lose data on the
//   first save.
// * Marking the node `atom: true` keeps ProseMirror from recursing
//   into the payload — the whole card is a single, indivisible unit
//   from the editor's perspective. Edits happen through dedicated
//   dialog panels (TODO milestones), not by typing into the card.
// * `selectable: true` lets the user select the card with a click and
//   delete it with `Delete` / `Backspace`, which is the expected
//   keyboard model for editor-as-document.
//
// The render path uses a React NodeView so we can show a preview
// (lucide icon + payload summary) instead of a placeholder bar.

export interface BlockCardAttrs {
  _key: string
  _ptType: string
  payload: Block
}

export const BlockCardNode = Node.create({
  name: 'blockCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      _key: { default: '' },
      _ptType: { default: '' },
      payload: { default: null as Block | null },
    }
  },
  parseHTML() {
    // Pasting a `<div data-pt-block-card="…">` is unusual but harmless —
    // we still register a parse rule so paste from another editor
    // panel survives without error.
    return [{ tag: 'div[data-pt-block-card]' }]
  },
  renderHTML({ node }) {
    const ptType = (node.attrs as BlockCardAttrs)._ptType
    return ['div', { 'data-pt-block-card': ptType, contenteditable: 'false' }, 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockCardView)
  },
})

function BlockCardView(props: NodeViewProps) {
  const attrs = props.node.attrs as BlockCardAttrs
  const payload = attrs.payload
  const [editing, setEditing] = useState(false)
  const editable = payload !== null && isInlineEditable(payload._type)

  const commitPayload = (next: Block, editorRender?: string) => {
    let cleaned = stripPrerenderArtifacts(next)
    if (cleaned._type === 'mathBlock' && editorRender !== undefined && editorRender !== '') {
      cleaned = { ...cleaned, mathml: editorRender }
    }
    props.updateAttributes({ payload: cleaned })
    setEditing(false)
  }

  return (
    <NodeViewWrapper
      data-pt-block-card={attrs._ptType}
      className={cn(
        'group relative my-3 rounded-xl border-2 border-dashed bg-muted/30 p-4 text-sm',
        props.selected ? 'border-primary' : 'border-border',
      )}
      contentEditable={false}
    >
      <div className="flex items-start gap-3">
        <CardIcon ptType={attrs._ptType} />
        <div className="grow">
          <div className="flex items-center gap-2">
            <span className="font-medium">{cardTitle(attrs._ptType)}</span>
            {editable && !editing ? (
              <Button
                variant="ghost"
                size="icon"
                title="编辑源"
                aria-label="编辑源"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => setEditing(true)}
              >
                <SquarePenIcon />
              </Button>
            ) : null}
          </div>
          {editing && payload !== null ? (
            <CardSourceEditor payload={payload} onCommit={commitPayload} onCancel={() => setEditing(false)} />
          ) : (
            <>
              {payload !== null && payload._type === 'musicPlayer' ? (
                <MusicPlayerOptions
                  stableId={attrs._key}
                  auto={payload.auto === true}
                  center={payload.center === true}
                  onFlagChange={(flag, enabled) =>
                    props.updateAttributes({
                      payload: stripPrerenderArtifacts(patchMusicPlayerFlag(payload, flag, enabled)),
                    })
                  }
                />
              ) : null}
              <CardSummary payload={payload} />
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          title="删除"
          aria-label="删除该块"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => props.deleteNode()}
        >
          <TrashIcon />
        </Button>
      </div>
    </NodeViewWrapper>
  )
}

function isInlineEditable(ptType: string): boolean {
  return ptType === 'mathBlock'
}

// Drop the cached server-rendered fields when the user mutates the
// source. The save path repopulates them; leaving stale renders in
// place would silently desync source and preview.
//
// Exception: `commitPayload` may attach a fresh math render immediately
// after `fetchRenderMath` so the card shows server-rendered output
// instead of raw source.
function stripPrerenderArtifacts(block: Block): Block {
  if (block._type === 'mathBlock') {
    return stripMathArtifacts(block)
  }
  if (block._type === 'code') {
    const { highlightedHtml: _ignored, ...rest } = block as { highlightedHtml?: string } & Block
    return rest as Block
  }
  return block
}

function CardIcon({ ptType }: { ptType: string }) {
  const props = { className: 'mt-0.5 size-5 shrink-0 text-muted-foreground' }
  switch (ptType) {
    case 'musicPlayer':
      return musicBlockIcon(props)
    case 'mathBlock':
      return mathBlockIcon(props)
    default:
      return <FunctionSquareIcon {...props} />
  }
}

function cardTitle(ptType: string): string {
  switch (ptType) {
    case 'musicPlayer':
      return musicBlockTitle()
    case 'mathBlock':
      return mathBlockTitle()
    default:
      return `自定义块 (${ptType})`
  }
}

interface CardSourceEditorProps {
  payload: Block
  onCommit: (next: Block, editorRender?: string) => void
  onCancel: () => void
}

function CardSourceEditor({ payload, onCommit, onCancel }: CardSourceEditorProps) {
  if (payload._type === 'mathBlock') {
    return <MathBlockSourceEditor payload={payload} onCommit={onCommit} onCancel={onCancel} />
  }
  return null
}

interface CardSummaryProps {
  payload: Block | null
}

function CardSummary({ payload }: CardSummaryProps) {
  if (payload === null) {
    return <div className="text-xs text-muted-foreground">无效的负载</div>
  }
  // 3 block types get specialized summaries; every other PT block type
  // falls through to the generic `_type: …` debug label. Enumerating
  // each fallback case explicitly buys nothing here.
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check
  switch (payload._type) {
    case 'musicPlayer':
      return <MusicBlockSummary payload={payload} />
    case 'mathBlock':
      return <MathBlockSummary payload={payload} />
    default:
      return <div className="mt-1 text-xs text-muted-foreground">_type: {(payload as { _type: string })._type}</div>
  }
}
