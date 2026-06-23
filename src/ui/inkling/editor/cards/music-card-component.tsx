import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { MusicIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { InklingMusicCardNode } from '@/shared/inkling/schema'
import type { MusicCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { LoopIcon, PlayIcon, VolumeUpIcon } from '@/ui/icons/aplayer'
import { KoenigCardWrapper } from '@/ui/inkling/components/KoenigCardWrapper'
import { ActionToolbar } from '@/ui/inkling/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling/components/ui/ToolbarMenu'
import { useCardContext } from '@/ui/inkling/context/CardContext'
import { useInklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'
import { DELETE_CARD_COMMAND } from '@/ui/inkling/editor/commands'

interface MusicPreviewMeta {
  name: string
  artist: string
  coverUrl: string
}

function StaticMusicPreview({ meta, playerId }: { meta: MusicPreviewMeta | null; playerId: string }) {
  const displayName = meta?.name ?? playerId
  const artist = meta?.artist ?? ''
  const coverUrl = meta?.coverUrl ?? ''

  return (
    <div className="aplayer relative m-aplayer-margin overflow-hidden rounded-sm bg-white font-[Arial,Helvetica,sans-serif] leading-normal shadow-[0_2px_2px_0_rgba(0,0,0,0.07),0_1px_5px_0_rgba(0,0,0,0.1)] select-none dark:rounded-[var(--radius-sm)] dark:bg-surface dark:shadow-[0_0_0_1px_rgb(255_255_255_/_8%)] [&_*]:box-content">
      <div className="aplayer-body relative">
        <div
          className="aplayer-pic group relative float-left h-aplayer-art-sm w-aplayer-art-sm cursor-default bg-cover bg-center transition-all duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]"
          style={coverUrl !== '' ? { backgroundImage: `url("${coverUrl}")` } : undefined}
        >
          {coverUrl === '' ? (
            <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
              ♫
            </div>
          ) : (
            <div className="aplayer-button aplayer-play absolute right-1/2 bottom-1/2 -mr-5 -mb-5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-black/20 text-white opacity-60 shadow-[0_1px_1px_rgba(0,0,0,0.2)] dark:[filter:brightness(1.35)]">
              <PlayIcon className="!h-5 !w-5" />
            </div>
          )}
        </div>
        <div className="aplayer-info ml-aplayer-info-gap-sm !box-border h-aplayer-art-sm pt-3.5 pr-aplayer-info-pad-x pb-0 pl-2.5">
          <div className="aplayer-music mb-aplayer-music-gap ml-aplayer-music-indent h-5 cursor-default overflow-hidden pb-0.5 text-ellipsis whitespace-nowrap select-text">
            <span className="aplayer-title text-sm dark:text-ink-1">{displayName}</span>
            {artist !== '' ? (
              <span className="aplayer-author text-xs text-ink-4 dark:text-ink-4"> - {artist}</span>
            ) : null}
          </div>
          <div className="aplayer-controller relative flex items-center">
            <div className="aplayer-bar-wrap relative m-0 mr-3.5 ml-2.5 h-0.5 flex-1 rounded-none bg-aplayer-bar">
              <div className="aplayer-bar absolute top-0 left-0 h-full w-0 rounded-none bg-brand" />
            </div>
            <div className="aplayer-time relative right-0 flex h-aplayer-time-height items-center pl-aplayer-time-pad text-aplayer-time text-ink-4 dark:text-ink-4">
              <span className="aplayer-time-inner inline-flex h-aplayer-icon items-center">
                <span className="aplayer-ptime">--:--</span>
                {' / '}
                <span className="aplayer-dtime">--:--</span>
              </span>
              <span className="aplayer-icon flex h-aplayer-icon w-aplayer-icon cursor-default items-center justify-center p-0 text-ink-3 opacity-40 dark:text-ink-3">
                <VolumeUpIcon />
              </span>
              <span className="aplayer-icon aplayer-icon-loop flex h-aplayer-icon w-aplayer-icon cursor-default items-center justify-center p-0 text-ink-3 opacity-40 dark:text-ink-3">
                <LoopIcon />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MusicCardComponent({ node }: { node: MusicCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const { isSelected, isEditing, setEditing } = useCardContext()
  const { openMusicPicker } = useInklingArticleEditorActions()
  const [meta, setMeta] = useState<MusicPreviewMeta | null>(null)

  const playerId = node.getPlayerId()

  useEffect(() => {
    if (playerId === '') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { orpc } = await import('@/client/api/client')
        const result = await orpc.music.get({ id: playerId })
        if (!cancelled) {
          setMeta({ name: result.music.name, artist: result.music.artist, coverUrl: result.music.pic ?? '' })
        }
      } catch {
        if (!cancelled) {
          setMeta(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [playerId])

  const update = useCallback(
    (patch: Partial<InklingMusicCardNode>): void => {
      editor.update(() => {
        if (patch.playerId !== undefined) {
          node.setPlayerId(patch.playerId)
        }
        if (patch.auto !== undefined) {
          node.setAuto(patch.auto)
        }
        if (patch.center !== undefined) {
          node.setCenter(patch.center)
        }
      })
    },
    [editor, node],
  )

  const handlePick = () => openMusicPicker?.()

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

      <div className="space-y-2 p-3">
        {playerId !== '' ? (
          <StaticMusicPreview meta={meta} playerId={playerId} />
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-grey-500">
              <MusicIcon className="h-4 w-4" />
              未选择音乐
            </span>
            <button
              type="button"
              onClick={handlePick}
              className="rounded bg-grey-900 px-3 py-1 text-xs text-white hover:bg-grey-800 dark:bg-grey-100 dark:text-grey-900"
            >
              选择音乐
            </button>
          </div>
        )}
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePick}
              className="rounded border border-grey-300 px-3 py-1 text-xs hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800"
            >
              {playerId !== '' ? '更换音乐' : '选择音乐'}
            </button>
            <label className="flex items-center gap-1 text-xs text-grey-600 dark:text-grey-400">
              <input type="checkbox" checked={node.getAuto()} onChange={(e) => update({ auto: e.target.checked })} />
              自动播放
            </label>
            <label className="flex items-center gap-1 text-xs text-grey-600 dark:text-grey-400">
              <input
                type="checkbox"
                checked={node.getCenter()}
                onChange={(e) => update({ center: e.target.checked })}
              />
              居中显示
            </label>
          </div>
        ) : null}
      </div>
    </KoenigCardWrapper>
  )
}
