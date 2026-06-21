import type { ReactNode } from 'react'

import { ImageIcon } from 'lucide-react'
import { useCallback } from 'react'

import type { InklingImageCardNode } from '@/shared/inkling/schema'
import type { ImageCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { useInklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'
import { CardShell, parseImageLayout } from '@/ui/inkling/editor/cards/card-shell'
import { useCardNode } from '@/ui/inkling/editor/cards/use-card-node'

export function ImageCardComponent({ node }: { node: ImageCardNode }): ReactNode {
  const { editor, isSelected } = useCardNode(node)
  const { openImagePicker } = useInklingArticleEditorActions()

  const update = useCallback(
    (patch: Partial<InklingImageCardNode>): void => {
      editor.update(() => {
        if (patch.src !== undefined) {
          node.setSrc(patch.src)
        }
        if (patch.alt !== undefined) {
          node.setAlt(patch.alt)
        }
        if (patch.caption !== undefined) {
          node.setCaption(patch.caption)
        }
        if (patch.layout !== undefined) {
          node.setLayout(patch.layout)
        }
        if (patch.width !== undefined) {
          node.setWidth(patch.width)
        }
        if (patch.height !== undefined) {
          node.setHeight(patch.height)
        }
        if (patch.thumbhash !== undefined) {
          node.setThumbhash(patch.thumbhash)
        }
        if (patch.storagePath !== undefined) {
          node.setStoragePath(patch.storagePath)
        }
        if (patch.imageId !== undefined) {
          node.setImageId(patch.imageId)
        }
      })
    },
    [editor, node],
  )

  const handlePick = () => openImagePicker?.()

  return (
    <CardShell nodeKey={node.getKey()} className="space-y-2 p-3">
      {node.getSrc() === '' ? (
        <button
          type="button"
          onClick={handlePick}
          className="inkling-card-button--primary flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-brand/30 bg-muted/20 py-10 text-sm text-muted-foreground transition hover:border-brand/60 hover:bg-muted/40"
        >
          <ImageIcon className="h-8 w-8 opacity-40" />
          <span>选择图片</span>
        </button>
      ) : (
        <img
          src={node.getSrc()}
          alt={node.getAlt()}
          className="max-h-96 w-full rounded object-contain"
          decoding="async"
        />
      )}
      {node.getSrc() !== '' && !isSelected ? (
        <div className="text-center text-xs text-muted-foreground">点击卡片进入编辑模式</div>
      ) : null}
      {isSelected ? (
        <div className="inkling-card-controlbar flex-wrap">
          <input
            type="text"
            value={node.getAlt()}
            onChange={(e) => update({ alt: e.target.value })}
            placeholder="替代文本 (alt)"
            className="inkling-card-input"
          />
          <select
            value={node.getLayout()}
            onChange={(e) => {
              const layout = parseImageLayout(e.target.value)
              if (layout !== undefined) {
                update({ layout })
              }
            }}
            className="inkling-card-select"
          >
            <option value="center">居中</option>
            <option value="left">左对齐</option>
            <option value="right">右对齐</option>
          </select>
          <button type="button" onClick={handlePick} className="inkling-card-button">
            更换图片
          </button>
          <input
            type="text"
            value={node.getCaption()}
            onChange={(e) => update({ caption: e.target.value })}
            placeholder="图片说明 (caption)"
            className="inkling-card-input basis-full"
          />
        </div>
      ) : null}
    </CardShell>
  )
}
