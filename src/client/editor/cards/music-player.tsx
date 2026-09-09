// The `music-player` host card's editing-side assembly (plan
// docs/plans/inkling-editor-replacement.md, round R10; picker wired in R11) —
// same dual-entry contract as `./solution`. The card has no nested editors:
// the dataset is `playerId` plus the save-time meta snapshot (server-owned
// keys, see `@/shared/lexical/artifacts`), so the canvas shows a static
// preview of the resolved song (or the unresolved/empty state) — the same
// structure the exportDOM fallback markup carries (the WYSIWYG gate).
//
// The picker dialog is host-owned (`MusicPickerDialog` in PageBodyEditor):
// the slash menu inserts an EMPTY card, and clicking the placeholder asks the
// host to open the picker through `MusicPickContext` (the pick writes
// `playerId` back on the node). The tiptap block's `auto`/`center` flags
// are deliberately out of the R10 dataset (the R7 contract pins the
// dataset to playerId + meta snapshot); if parity demands them back, that
// is an R11+ schema/card evolution.

import { defineCard, generateDecoratorNode } from '@inkling/editor'
import { Music2Icon } from 'lucide-react'

import { useOpenMusicPicker, type MusicPickTarget } from '@/client/editor/cards/music-pick-context'
import { inklingHostCardMatches } from '@/shared/lexical/cards/menu-matches'
import {
  hasMusicPlayerMeta,
  MUSIC_PLAYER_CARD_CLASSES,
  MUSIC_PLAYER_CARD_PROPERTIES,
  type MusicPlayerCardMeta,
  renderMusicPlayerCard,
} from '@/shared/lexical/cards/music-player'
import { MUSIC_PLAYER_NODE_TYPE } from '@/shared/lexical/node-whitelist'
import { isSafeUrl } from '@/shared/sanitize-url'

export const BaseMusicPlayerNode = class extends generateDecoratorNode({
  nodeType: MUSIC_PLAYER_NODE_TYPE,
  properties: MUSIC_PLAYER_CARD_PROPERTIES,
  defaultRenderFn: renderMusicPlayerCard,
}) {}

export type MusicPlayerCardNode = InstanceType<typeof BaseMusicPlayerNode>

/** The static preview the canvas shows for a resolved player — the same
 * structure `musicPlayerFallbackHtml` produces for the export mount point. */
export function MusicPlayerCardView({ meta }: { meta: MusicPlayerCardMeta }) {
  return (
    <div className={MUSIC_PLAYER_CARD_CLASSES.wrapper}>
      <div className={MUSIC_PLAYER_CARD_CLASSES.fallback} data-music-player-fallback="">
        {meta.cover === '' || !isSafeUrl(meta.cover) ? (
          <span className={MUSIC_PLAYER_CARD_CLASSES.fallbackGlyph} aria-hidden="true">
            🎵
          </span>
        ) : (
          <img className={MUSIC_PLAYER_CARD_CLASSES.fallbackCover} src={meta.cover} alt={meta.name} />
        )}
        <div className={MUSIC_PLAYER_CARD_CLASSES.fallbackMeta}>
          <div className={MUSIC_PLAYER_CARD_CLASSES.fallbackName}>{meta.name}</div>
          <div className={MUSIC_PLAYER_CARD_CLASSES.fallbackArtist}>{meta.artist}</div>
        </div>
      </div>
    </div>
  )
}

// The component renders from a PLAIN meta snapshot — it never touches the
// node instance. The generated property getters call getLatest(), which
// throws when React re-renders outside Lexical's commit (or against a node
// instance a later edit already replaced): Lexical #195. Reading the dataset
// inside `render(node)` below is safe because decorate() runs inside the
// reconciler's active read — the same split inkling's own cards use
// (renderAudioCard reads the getters, AudioNodeComponent gets plain props).
// The node reference still crosses as the pick target: the pick write goes
// through the generated setter inside editor.update(), whose getWritable()
// resolves the latest instance by key (see music-pick-context.ts).
function MusicPlayerCardComponent({ meta, pickTarget }: { meta: MusicPlayerCardMeta; pickTarget: MusicPickTarget }) {
  const openMusicPicker = useOpenMusicPicker()
  if (!hasMusicPlayerMeta(meta)) {
    // Unresolved card: inside PageBodyEditor the placeholder is the pick
    // entry (R11 — the picker dialog is host-owned); elsewhere it stays a
    // static hint.
    const label = meta.playerId === '' ? '音乐播放器 · 点击选择歌曲' : `音乐播放器 · ${meta.playerId}（保存时解析）`
    if (openMusicPicker === null) {
      return (
        <div className={MUSIC_PLAYER_CARD_CLASSES.wrapper}>
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border text-sm text-ink-3">
            {label}
          </div>
        </div>
      )
    }
    return (
      <div className={MUSIC_PLAYER_CARD_CLASSES.wrapper}>
        <button
          type="button"
          className="flex h-20 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-ink-3 transition hover:border-brand/60 hover:text-ink-1"
          // Keep the click from double-firing the card wrapper's selection.
          onClick={(event) => {
            event.stopPropagation()
            openMusicPicker(pickTarget)
          }}
        >
          {label}
        </button>
      </div>
    )
  }
  return <MusicPlayerCardView meta={meta} />
}

export const musicPlayerCard = defineCard({
  nodeType: MUSIC_PLAYER_NODE_TYPE,
  baseNode: BaseMusicPlayerNode,
  decorateTarget: { width: 'regular' },
  insert: { openInEditMode: true },
  menu: [
    {
      label: '音乐播放器',
      labelKey: 'music-player',
      desc: '嵌入一首音乐库中的歌曲',
      icon: Music2Icon,
      command: 'insert',
      insertParams: {},
      matches: [...inklingHostCardMatches.musicPlayer],
      priority: 19,
    },
  ],
  toolbarLabel: MUSIC_PLAYER_NODE_TYPE,
  render(node) {
    // Reads happen HERE, inside decorate()'s reconciler read — see the
    // MusicPlayerCardComponent note for why the component gets a snapshot.
    const meta: MusicPlayerCardMeta = {
      playerId: node.playerId,
      name: node.name,
      artist: node.artist,
      cover: node.cover,
      audioUrl: node.audioUrl,
      lyric: node.lyric,
    }
    return <MusicPlayerCardComponent meta={meta} pickTarget={node} />
  },
})
