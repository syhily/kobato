// The music card's pick-seam glue: the picker DIALOG is host data flow (it
// queries the music library over RPC and uploads through the admin surface), so
// the card assembly in `@kobato/inkling/host-cards` ships without one and the
// host registers this renderer at module scope — before any composer mounts.
// `autoOpenOnInsert` rides the registration, so menu inserts open the picker
// exactly as they did when the spec carried it inline.

import type { AdminMusicDto } from '@kobato/contracts/music'
import type { MusicPlayerCardMeta } from '@kobato/inkling/headless/cards/music-player'

import { registerCardPicker, useCardChrome, type CardPickerRenderProps } from '@kobato/inkling'
import { MUSIC_PLAYER_NODE_TYPE } from '@kobato/inkling/headless/node-whitelist'
import { isMusicPlayerCardNode, type MusicPlayerCardNode } from '@kobato/inkling/host-cards'
import { MusicPickerDialog } from '@kobato/web-admin/ui/editor/pickers/MusicPickerDialog'

export function musicPickMeta(music: AdminMusicDto): MusicPlayerCardMeta {
  return {
    playerId: music.playerId,
    name: music.name,
    artist: music.artist.join(' / '),
    cover: music.coverUrl,
    audioUrl: music.audioUrl,
    lyric: music.lyric ?? '',
  }
}

export function MusicCardPicker({ nodeKey, close, fromInsert }: CardPickerRenderProps) {
  const { write } = useCardChrome<MusicPlayerCardNode>(nodeKey, isMusicPlayerCardNode)
  return (
    <MusicPickerDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
      onPick={(music) => {
        const meta = musicPickMeta(music)
        write(
          (node) => {
            node.playerId = meta.playerId
            node.name = meta.name
            node.artist = meta.artist
            node.cover = meta.cover
            node.audioUrl = meta.audioUrl
            node.lyric = meta.lyric
          },
          { mergeHistory: fromInsert === true },
        )
        close()
      }}
    />
  )
}

registerCardPicker(MUSIC_PLAYER_NODE_TYPE, {
  autoOpenOnInsert: true,
  render: (props) => <MusicCardPicker {...props} />,
})
