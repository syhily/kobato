import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { ImageOffIcon, RotateCcwIcon, TrashIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ImageBlockLayout } from '@/shared/pt/schema'

import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@/ui/components/radio-group'
import { cn } from '@/ui/lib/cn'

// React NodeView for the image block. Replaces the bare `<img>` that
// Tiptap's default Image extension renders so the operator can edit
// alt + caption inline (matching the public renderer's `<figcaption>`)
// and swap the bytes via the existing image library picker.
//
// **State strategy**: alt + caption are double-bound (state ↔ node
// attrs). Local state keeps the inputs responsive while the user
// types; on every change we push back through `updateAttributes` so
// the canonical PT body in the editor reducer stays in sync. There's
// no save button on the inputs themselves — the autosave loop in the
// outer shell flushes the whole body on idle.
//
// Manual external URL pasting is intentionally removed; every image
// must come from the media library so the asset host stays predictable
// and CSP `img-src` remains narrow.

export function ImageNodeView(props: NodeViewProps) {
  const attrs = props.node.attrs as {
    src?: string
    alt?: string
    caption?: string
    width?: number
    height?: number
    storagePath?: string
    thumbhash?: string
    imageId?: string
    layout?: ImageBlockLayout
  }
  const [alt, setAlt] = useState(attrs.alt ?? '')
  const [caption, setCaption] = useState(attrs.caption ?? '')

  const latestPropsRef = useRef(props)
  latestPropsRef.current = props

  const altTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state in sync when attrs change from outside this view —
  // e.g. undo/redo, the library picker callback overwriting the whole
  // node, or scripted bulk edits. Without these, the inputs keep
  // showing the stale value the user typed before the external change.
  // When `commitAlt` echoes back through `updateAttributes`, the synced
  // value matches local state and `setAlt` becomes a no-op.
  useEffect(() => {
    setAlt(attrs.alt ?? '')
  }, [attrs.alt])
  useEffect(() => {
    setCaption(attrs.caption ?? '')
  }, [attrs.caption])

  useEffect(() => {
    return () => {
      if (altTimeoutRef.current) {
        clearTimeout(altTimeoutRef.current)
      }
      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current)
      }
    }
  }, [])

  const commitAlt = (value: string) => {
    setAlt(value)
    if (altTimeoutRef.current) {
      clearTimeout(altTimeoutRef.current)
    }
    altTimeoutRef.current = setTimeout(() => {
      latestPropsRef.current.updateAttributes({ alt: value })
    }, 300)
  }
  const commitCaption = (value: string) => {
    setCaption(value)
    if (captionTimeoutRef.current) {
      clearTimeout(captionTimeoutRef.current)
    }
    captionTimeoutRef.current = setTimeout(() => {
      latestPropsRef.current.updateAttributes({ caption: value })
    }, 300)
  }
  const pos = props.getPos()

  const resolvedLayout: ImageBlockLayout = attrs.layout === 'left' || attrs.layout === 'right' ? attrs.layout : 'center'

  const setLayout = (next: ImageBlockLayout) => {
    props.updateAttributes({
      layout: next === 'center' ? undefined : next,
    })
  }

  return (
    <NodeViewWrapper
      data-image-node-view
      className={cn(
        'group relative my-3 flex flex-col gap-2 rounded-xl border-2 border-dashed bg-muted/20 p-3',
        props.selected ? 'border-primary' : 'border-border',
      )}
      contentEditable={false}
    >
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <ImageLibraryPicker
          trigger={
            <Button variant="secondary" size="icon" type="button" title="从媒体库选择" aria-label="从媒体库选择">
              <RotateCcwIcon />
            </Button>
          }
          onPick={(image) =>
            props.updateAttributes({
              src: image.publicUrl,
              alt: image.note ?? alt,
              width: image.width,
              height: image.height,
              thumbhash: image.thumbhash ?? undefined,
              storagePath: image.storagePath,
              imageId: image.id,
            })
          }
        />
        <Button
          variant="secondary"
          size="icon"
          type="button"
          title="删除图片块"
          aria-label="删除图片块"
          onClick={() => props.deleteNode()}
        >
          <TrashIcon />
        </Button>
      </div>

      {attrs.src !== undefined && attrs.src !== '' ? (
        <div
          className={cn(
            'relative w-fit max-w-full',
            resolvedLayout === 'left' && 'mr-auto ml-0',
            resolvedLayout === 'center' && 'mx-auto',
            resolvedLayout === 'right' && 'mr-0 ml-auto',
          )}
        >
          <img
            src={attrs.src}
            alt={alt}
            width={attrs.width}
            height={attrs.height}
            className="max-h-72 w-auto rounded object-contain"
            draggable={false}
          />
          <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-(--text-nano) text-white">
            媒体库
          </span>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
          <ImageOffIcon /> 尚未选择图片
        </div>
      )}

      <div className="grid gap-1.5">
        <Label className="text-xs">布局</Label>
        <RadioGroup
          value={resolvedLayout}
          onValueChange={(v) => {
            if (v === 'left' || v === 'center' || v === 'right') {
              setLayout(v)
            }
          }}
          className="flex flex-row flex-wrap gap-x-4 gap-y-2"
        >
          <label htmlFor={`img-${pos}-layout-left`} className="flex cursor-pointer items-center gap-2 text-xs">
            <RadioGroupItem id={`img-${pos}-layout-left`} value="left" />
            <span>居左</span>
          </label>
          <label htmlFor={`img-${pos}-layout-center`} className="flex cursor-pointer items-center gap-2 text-xs">
            <RadioGroupItem id={`img-${pos}-layout-center`} value="center" />
            <span>居中</span>
          </label>
          <label htmlFor={`img-${pos}-layout-right`} className="flex cursor-pointer items-center gap-2 text-xs">
            <RadioGroupItem id={`img-${pos}-layout-right`} value="right" />
            <span>居右</span>
          </label>
        </RadioGroup>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs" htmlFor={`img-${pos}-alt`}>
          替代文本（alt）
        </Label>
        <Input
          id={`img-${pos}-alt`}
          value={alt}
          placeholder="无障碍说明，搜索引擎也会读取"
          onChange={(event) => commitAlt(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs" htmlFor={`img-${pos}-caption`}>
          图说（caption）
        </Label>
        <Input
          id={`img-${pos}-caption`}
          value={caption}
          placeholder="可选，渲染为 <figcaption>"
          onChange={(event) => commitCaption(event.target.value)}
        />
      </div>
    </NodeViewWrapper>
  )
}
