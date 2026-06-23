import type { ReactNode } from 'react'

import { ImageIcon } from 'lucide-react'
import { useCallback } from 'react'

import type { InklingImageCardNode } from '@/shared/inkling/schema'
import type { ImageCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { useInklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'
import { ActionToolbar } from '@/ui/inkling/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling/components/ui/ToolbarMenu'
import { KoenigCardWrapper } from '@/ui/inkling/components/KoenigCardWrapper'
import { useCardContext } from '@/ui/inkling/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling/editor/commands'
import { ImageBlock } from '@/ui/inkling/render/blocks/ImageBlock'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

export function ImageCardComponent({ node }: { node: ImageCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const { isSelected, isEditing, setEditing } = useCardContext()
  const { openImagePicker } = useInklingArticleEditorActions()

  const update = useCallback(
    (patch: Partial<InklingImageCardNode>): void => {
      editor.update(() => {
        if (patch.src !== undefined) node.setSrc(patch.src)
        if (patch.alt !== undefined) node.setAlt(patch.alt)
        if (patch.caption !== undefined) node.setCaption(patch.caption)
        if (patch.layout !== undefined) node.setLayout(patch.layout)
        if (patch.width !== undefined) node.setWidth(patch.width)
        if (patch.height !== undefined) node.setHeight(patch.height)
        if (patch.thumbhash !== undefined) node.setThumbhash(patch.thumbhash)
        if (patch.storagePath !== undefined) node.setStoragePath(patch.storagePath)
        if (patch.imageId !== undefined) node.setImageId(patch.imageId)
      })
    },
    [editor, node],
  )

  const handlePick = () => openImagePicker?.()

  const renderNode: InklingImageCardNode = {
    type: 'image-card',
    version: 1,
    src: node.getSrc(),
    alt: node.getAlt(),
    caption: node.getCaption(),
    layout: node.getLayout(),
    width: node.getWidth(),
    height: node.getHeight(),
    thumbhash: node.getThumbhash(),
  }

  return (
    <KoenigCardWrapper nodeKey={node.getKey()}>
      <ActionToolbar isVisible={isSelected && !isEditing}>
        <ToolbarMenu>
          <ToolbarMenuItem icon="edit" label="编辑" onClick={() => setEditing(true)} />
          <ToolbarMenuItem
            icon="trash"
            label="删除"
            onClick={() => editor.dispatchCommand(DELETE_CARD_COMMAND, undefined)}
          />
        </ToolbarMenu>
      </ActionToolbar>

      {node.getSrc() === '' ? (
        isEditing || isSelected ? (
          <button
            type="button"
            onClick={handlePick}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-grey-300 bg-grey-50 py-10 text-sm text-grey-500 transition hover:border-grey-400 hover:bg-grey-100 dark:border-grey-700 dark:bg-grey-900"
          >
            <ImageIcon className="h-8 w-8 opacity-40" />
            <span>选择图片</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-grey-500">
            <ImageIcon className="h-8 w-8 opacity-40" />
            <span>空图片卡片（点击编辑）</span>
          </div>
        )
      ) : isEditing ? (
        <div className="space-y-3 p-3">
          <ImageBlock node={renderNode} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={node.getAlt()}
              onChange={(e) => update({ alt: e.target.value })}
              placeholder="替代文本 (alt)"
              className="min-w-[200px] flex-1 rounded border border-grey-300 px-2 py-1 text-sm dark:border-grey-700 dark:bg-grey-900"
            />
            <select
              value={node.getLayout()}
              onChange={(e) => update({ layout: e.target.value as InklingImageCardNode['layout'] })}
              className="rounded border border-grey-300 px-2 py-1 text-sm dark:border-grey-700 dark:bg-grey-900"
            >
              <option value="center">居中</option>
              <option value="left">左对齐</option>
              <option value="right">右对齐</option>
            </select>
            <button type="button" onClick={handlePick} className="rounded border border-grey-300 px-3 py-1 text-sm hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800">
              更换图片
            </button>
          </div>
          <input
            type="text"
            value={node.getCaption()}
            onChange={(e) => update({ caption: e.target.value })}
            placeholder="图片说明 (caption)"
            className="w-full rounded border border-grey-300 px-2 py-1 text-sm dark:border-grey-700 dark:bg-grey-900"
          />
        </div>
      ) : (
        <ImageBlock node={renderNode} />
      )}
    </KoenigCardWrapper>
  )
}
