import type { MusicPlayerNode } from '@kobato/editor/lexical-core/nodes/music-player-node'
import type { MusicPlayerBlock } from '@kobato/shared/legacy-pt/schema'
import type { LexicalEditor } from 'lexical'

import { Button } from '@kobato/editor/engine/components/button'
import {
  MusicBlockSummary,
  MusicPlayerOptions,
  patchMusicPlayerFlag,
} from '@kobato/editor/engine/lexical/block-cards/MusicBlock'
import { cn } from '@kobato/editor/engine/lib/cn'
import { Music2Icon, TrashIcon } from 'lucide-react'

/**
 * Editor view for `MusicPlayerNode` — reuses the tiptap block-card
 * pieces: the APlayer summary (`MusicBlockSummary`) plus the
 * auto-play / center flag options (`MusicPlayerOptions`). Flag changes
 * write back into the node fields.
 */

interface MusicPlayerViewProps {
  node: MusicPlayerNode
  editor: LexicalEditor
}

export function MusicPlayerView({ node, editor }: MusicPlayerViewProps) {
  const editable = editor.isEditable()

  const payload: MusicPlayerBlock = {
    _type: 'musicPlayer',
    _key: node.getPtKey() ?? node.getKey(),
    playerId: node.getPlayerId(),
    auto: node.getAuto(),
    center: node.getCenter(),
  }

  return (
    <div
      data-pt-block-card="musicPlayer"
      className={cn('group relative my-3 rounded-xl border-2 border-dashed bg-muted/30 p-4 text-sm')}
      contentEditable={false}
    >
      <div className="flex items-start gap-3">
        <Music2Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="grow">
          <div className="flex items-center gap-2">
            <span className="font-medium">音乐播放器</span>
          </div>
          {editable ? (
            <MusicPlayerOptions
              stableId={node.getPtKey() ?? node.getKey()}
              auto={node.getAuto() === true}
              center={node.getCenter() === true}
              onFlagChange={(flag, enabled) => {
                editor.update(() => {
                  const next = patchMusicPlayerFlag(payload, flag, enabled)
                  if (next._type === 'musicPlayer') {
                    node.setAuto(next.auto)
                    node.setCenter(next.center)
                  }
                })
              }}
            />
          ) : null}
          <MusicBlockSummary payload={payload} />
        </div>
        {editable ? (
          <Button
            variant="ghost"
            size="icon"
            title="删除"
            aria-label="删除该块"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => {
              editor.update(() => {
                node.remove()
              })
            }}
          >
            <TrashIcon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
