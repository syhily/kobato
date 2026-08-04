import type { ImageNode } from '@kobato/editor/lexical-core/nodes/image-node'
import type { ImageBlockLayout } from '@kobato/shared/legacy-pt/schema'
import type { LexicalEditor } from 'lexical'

import { Button } from '@kobato/editor/engine/components/button'
import { Input } from '@kobato/editor/engine/components/input'
import { Label } from '@kobato/editor/engine/components/label'
import { RadioGroup, RadioGroupItem } from '@kobato/editor/engine/components/radio-group'
import { getPickerHandlers } from '@kobato/editor/engine/lexical/picker-registry'
import { cn } from '@kobato/editor/engine/lib/cn'
import { ImageOffIcon, RotateCcwIcon, TrashIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Editor view for `ImageNode` — the Lexical port of the tiptap
 * `ImageNodeView` interaction surface: media-library replacement (via
 * the host-injected picker renderer), layout radio group, debounced
 * alt/caption inputs, delete. The media picker is injected by the host
 * through `registerPickerHandlers`; without it the replace button hides.
 */

interface ImageViewProps {
  node: ImageNode
  editor: LexicalEditor
}

export function ImageView({ node, editor }: ImageViewProps) {
  const editable = editor.isEditable()
  const handlers = getPickerHandlers(editor)
  const renderImagePicker = editable ? handlers?.renderImagePicker : undefined

  const [alt, setAlt] = useState(node.getAlt() ?? '')
  const [caption, setCaption] = useState(node.getCaption() ?? '')

  const latestNodeRef = useRef(node)
  useEffect(() => {
    latestNodeRef.current = node
  })

  // Follow external node field changes (paste / undo / remote revision).
  const [lastAlt, setLastAlt] = useState(node.getAlt())
  if (node.getAlt() !== lastAlt) {
    setLastAlt(node.getAlt())
    setAlt(node.getAlt() ?? '')
  }
  const [lastCaption, setLastCaption] = useState(node.getCaption())
  if (node.getCaption() !== lastCaption) {
    setLastCaption(node.getCaption())
    setCaption(node.getCaption() ?? '')
  }

  const altTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (altTimeoutRef.current !== null) {
        clearTimeout(altTimeoutRef.current)
      }
      if (captionTimeoutRef.current !== null) {
        clearTimeout(captionTimeoutRef.current)
      }
    }
  }, [])

  const commitAlt = (value: string) => {
    setAlt(value)
    if (altTimeoutRef.current !== null) {
      clearTimeout(altTimeoutRef.current)
    }
    altTimeoutRef.current = setTimeout(() => {
      editor.update(() => {
        if (latestNodeRef.current.isAttached()) {
          latestNodeRef.current.setAlt(value)
        }
      })
    }, 300)
  }
  const commitCaption = (value: string) => {
    setCaption(value)
    if (captionTimeoutRef.current !== null) {
      clearTimeout(captionTimeoutRef.current)
    }
    captionTimeoutRef.current = setTimeout(() => {
      editor.update(() => {
        if (latestNodeRef.current.isAttached()) {
          latestNodeRef.current.setCaption(value)
        }
      })
    }, 300)
  }

  const layout = node.getLayout()
  const resolvedLayout: ImageBlockLayout = layout === 'left' || layout === 'right' ? layout : 'center'

  const setLayout = (next: ImageBlockLayout) => {
    editor.update(() => {
      latestNodeRef.current.setLayout(next === 'center' ? undefined : next)
    })
  }

  const remove = () => {
    editor.update(() => {
      if (node.isAttached()) {
        node.remove()
      }
    })
  }

  return (
    <div
      data-image-node-view
      className={cn('group relative my-3 flex flex-col gap-2 rounded-xl border-2 border-dashed bg-muted/20 p-3')}
      contentEditable={false}
    >
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {renderImagePicker !== undefined
          ? renderImagePicker({
              trigger: (
                <Button variant="secondary" size="icon" type="button" title="从媒体库选择" aria-label="从媒体库选择">
                  <RotateCcwIcon />
                </Button>
              ),
              onPick: (image) =>
                editor.update(() => {
                  if (!node.isAttached()) {
                    return
                  }
                  node.setSrc(image.publicUrl)
                  node.setAlt(image.note ?? alt)
                  node.setWidth(image.width)
                  node.setHeight(image.height)
                  node.setThumbhash(image.thumbhash ?? undefined)
                  node.setStoragePath(image.storagePath)
                  node.setImageId(image.id)
                }),
            })
          : null}
        {editable ? (
          <Button
            variant="secondary"
            size="icon"
            type="button"
            title="删除图片块"
            aria-label="删除图片块"
            onClick={remove}
          >
            <TrashIcon />
          </Button>
        ) : null}
      </div>

      {node.getSrc() !== undefined && node.getSrc() !== '' ? (
        <div
          className={cn(
            'relative w-fit max-w-full',
            resolvedLayout === 'left' && 'mr-auto ml-0',
            resolvedLayout === 'center' && 'mx-auto',
            resolvedLayout === 'right' && 'mr-0 ml-auto',
          )}
        >
          <img
            src={node.getSrc()}
            alt={alt}
            width={node.getWidth()}
            height={node.getHeight()}
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
          disabled={!editable}
          className="flex flex-row flex-wrap gap-x-4 gap-y-2"
        >
          <label
            htmlFor={`img-${node.getKey()}-layout-left`}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <RadioGroupItem id={`img-${node.getKey()}-layout-left`} value="left" />
            <span>居左</span>
          </label>
          <label
            htmlFor={`img-${node.getKey()}-layout-center`}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <RadioGroupItem id={`img-${node.getKey()}-layout-center`} value="center" />
            <span>居中</span>
          </label>
          <label
            htmlFor={`img-${node.getKey()}-layout-right`}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <RadioGroupItem id={`img-${node.getKey()}-layout-right`} value="right" />
            <span>居右</span>
          </label>
        </RadioGroup>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs" htmlFor={`img-${node.getKey()}-alt`}>
          替代文本（alt）
        </Label>
        <Input
          id={`img-${node.getKey()}-alt`}
          value={alt}
          disabled={!editable}
          placeholder="无障碍说明，搜索引擎也会读取"
          onChange={(event) => commitAlt(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs" htmlFor={`img-${node.getKey()}-caption`}>
          图说（caption）
        </Label>
        <Input
          id={`img-${node.getKey()}-caption`}
          value={caption}
          disabled={!editable}
          placeholder="可选，渲染为 <figcaption>"
          onChange={(event) => commitCaption(event.target.value)}
        />
      </div>
    </div>
  )
}
