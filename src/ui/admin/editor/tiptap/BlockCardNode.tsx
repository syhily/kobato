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
    return [{ tag: 'div[data-pt-block-card]' }]
  },
  renderHTML({ node }) {
    const rawAttrs: Record<string, unknown> = node.attrs
    const ptType = typeof rawAttrs._ptType === 'string' ? rawAttrs._ptType : ''
    return ['div', { 'data-pt-block-card': ptType, contenteditable: 'false' }, 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockCardView)
  },
})

function getStringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === key && typeof v === 'string') {
      return v
    }
  }
  return undefined
}

function isBlock(value: unknown): value is Block {
  return typeof value === 'object' && value !== null && '_type' in value
}

function BlockCardView(props: NodeViewProps) {
  const rawAttrs = props.node.attrs
  const _ptType = typeof rawAttrs._ptType === 'string' ? rawAttrs._ptType : ''
  const payload: unknown = rawAttrs.payload
  const [editing, setEditing] = useState(false)
  const payloadType = getStringProperty(payload, '_type')
  const editable = payloadType !== undefined && isInlineEditable(payloadType)

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
      data-pt-block-card={_ptType}
      className={cn(
        'group relative my-3 rounded-xl border-2 border-dashed bg-muted/30 p-4 text-sm',
        props.selected ? 'border-primary' : 'border-border',
      )}
      contentEditable={false}
    >
      <div className="flex items-start gap-3">
        <CardIcon ptType={_ptType} />
        <div className="grow">
          <div className="flex items-center gap-2">
            <span className="font-medium">{cardTitle(_ptType)}</span>
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
          {editing && isBlock(payload) ? (
            <CardSourceEditor payload={payload} onCommit={commitPayload} onCancel={() => setEditing(false)} />
          ) : (
            <>
              {isBlock(payload) && payload._type === 'musicPlayer' ? (
                <MusicPlayerOptions
                  stableId={typeof rawAttrs._key === 'string' ? rawAttrs._key : ''}
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

function CardSummary({ payload }: { payload: unknown }) {
  if (!isBlock(payload)) {
    return <div className="text-xs text-muted-foreground">无效的负载</div>
  }
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check
  switch (payload._type) {
    case 'musicPlayer':
      return <MusicBlockSummary payload={payload} />
    case 'mathBlock':
      return <MathBlockSummary payload={payload} />
    default:
      return <div className="mt-1 text-xs text-muted-foreground">_type: {payload._type}</div>
  }
}
