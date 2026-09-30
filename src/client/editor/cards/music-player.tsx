// The `music-player` host card's editing-side assembly (plan
// docs/plans/inkling-editor-replacement.md, round R10; the pick seam replaced
// the R11 MusicPickContext wiring) — same dual-entry contract as
// `./solution`. The card has no nested editors: the dataset is `playerId`
// plus the meta snapshot (server-owned keys, see `@/shared/lexical/artifacts`),
// so the canvas renders the real playable `MusicPlayerCard` (WYSIWYG with the
// public hydration-enhanced render; the static no-JS export fallback mirrors
// its paused initial state).
//
// The picker is declared on the spec (CONTEXT.md: "pick seam",
// "entity-backed card"): the slash menu inserts an EMPTY card and
// `autoOpenOnInsert` opens `MusicPickerDialog` on the fresh node; the
// placeholder click and the resolved card's toolbar replace affordance are
// the re-entry paths (`useCardPicker`). The pick writes `playerId` AND the
// full meta snapshot onto the node so the card turns playable immediately;
// the server-side save-time snapshot (`@/server/domains/pt/lexical-music-snapshot`)
// stays the authority refresh. The tiptap block's `auto`/`center` flags
// are deliberately out of the R10 dataset (the R7 contract pins the
// dataset to playerId + meta snapshot); if parity demands them back, that
// is a schema/card evolution.

import { Music2Icon } from 'lucide-react'

import type { AdminMusicDto } from '@/shared/contracts/music'

import {
  CardActionToolbar,
  type CardPickerRenderProps,
  type CardToolbarItem,
  defineCard,
  DELETE_CARD_COMMAND,
  generateDecoratorNode,
  useCardChrome,
  useCardPicker,
} from '@/inkling'
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
import { MusicPickerDialog } from '@/ui/admin/editor/pickers/MusicPickerDialog'
import { MusicPlayerCard } from '@/ui/public/music-player/music-player'

export const BaseMusicPlayerNode = class extends generateDecoratorNode({
  nodeType: MUSIC_PLAYER_NODE_TYPE,
  properties: MUSIC_PLAYER_CARD_PROPERTIES,
  defaultRenderFn: renderMusicPlayerCard,
}) {}

export type MusicPlayerCardNode = InstanceType<typeof BaseMusicPlayerNode>

// The card write seam's guard (useCardChrome): the assembled class subclasses
// this base (assembleCardNodeOnce), so instanceof narrows editor-state nodes.
function isMusicPlayerCardNode(node: unknown): node is MusicPlayerCardNode {
  return node instanceof BaseMusicPlayerNode
}

/**
 * The pick → meta mapping: the admin DTO onto the node's meta snapshot.
 * `artist` joins into the library's packed ' / ' form (the save-time
 * snapshot's shape), and the DTO's `coverUrl`/`audioUrl` land on the
 * dataset's `cover`/`audioUrl` keys verbatim — the meta keys are stripped
 * from client input at save and excluded from the dirty-check, so this write
 * is display-only and the save-time snapshot re-resolves them (origin-relative)
 * regardless.
 */
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

/**
 * The picker render the card's defineCard spec declares (CONTEXT.md: "pick
 * seam"): mounts the host-owned `MusicPickerDialog` against the requesting
 * node. The pick write goes through the card write seam — it resolves the
 * latest node instance by key inside `editor.update()`, so a card deleted
 * while the dialog was open no-ops instead of throwing (the picker host also
 * drops the request on that delete).
 */
export function MusicCardPicker({ nodeKey, close }: CardPickerRenderProps) {
  const { write } = useCardChrome(nodeKey, isMusicPlayerCardNode)
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
        write((node) => {
          node.playerId = meta.playerId
          node.name = meta.name
          node.artist = meta.artist
          node.cover = meta.cover
          node.audioUrl = meta.audioUrl
          node.lyric = meta.lyric
        })
        close()
      }}
    />
  )
}

/**
 * The resolved card's editing chrome (CONTEXT.md: "entity-backed card"): a
 * replace affordance (reopens the picker for the same node) and a remove
 * affordance (the shared DELETE_CARD_COMMAND choreography), rendered through
 * the layer's selection-driven `CardActionToolbar` idiom.
 */
export function musicCardToolbarItems({
  onReplace,
  onRemove,
}: {
  onReplace: () => void
  onRemove: () => void
}): CardToolbarItem[] {
  return [
    {
      kind: 'custom',
      icon: 'replace',
      label: '更换歌曲',
      dataTestId: 'replace-music-track',
      onClick: (event) => {
        event.stopPropagation()
        onReplace()
      },
    },
    {
      kind: 'custom',
      icon: 'trash',
      label: '删除播放器',
      dataTestId: 'remove-music-card',
      onClick: (event) => {
        event.stopPropagation()
        onRemove()
      },
    },
  ]
}

// The component renders from a PLAIN meta snapshot — it never touches the
// node instance. The generated property getters call getLatest(), which
// throws when React re-renders outside Lexical's commit (or against a node
// instance a later edit already replaced): Lexical #195. Reading the dataset
// inside `render(node)` below is safe because decorate() runs inside the
// reconciler's active read — the same split inkling's own cards use
// (renderAudioCard reads the getters, AudioNodeComponent gets plain props).
// Everything the pick seam and the chrome need crosses as the node KEY.
export function MusicPlayerCardComponent({ meta, nodeKey }: { meta: MusicPlayerCardMeta; nodeKey: string }) {
  const picker = useCardPicker()
  const { editor } = useCardChrome(nodeKey, isMusicPlayerCardNode)

  if (!hasMusicPlayerMeta(meta)) {
    // Unresolved card: the placeholder is the pick entry (the picker host is
    // a core plugin on every editable top-level surface, so no per-editor
    // wiring remains).
    const label = meta.playerId === '' ? '音乐播放器 · 点击选择歌曲' : `音乐播放器 · ${meta.playerId}（保存时解析）`
    return (
      <div className={MUSIC_PLAYER_CARD_CLASSES.wrapper}>
        <button
          type="button"
          className="flex h-20 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-ink-3 transition hover:border-brand/60 hover:text-ink-1"
          // Keep the click from double-firing the card wrapper's selection.
          onClick={(event) => {
            event.stopPropagation()
            picker.open(nodeKey)
          }}
        >
          {label}
        </button>
      </div>
    )
  }
  // Resolved card: the playable player, same component the public page
  // hydrates into. Its controls stopPropagation internally so they never
  // trigger the card chrome's selection/drag.
  return (
    <>
      <div className={MUSIC_PLAYER_CARD_CLASSES.wrapper}>
        <MusicPlayerCard
          artist={meta.artist}
          cover={isSafeUrl(meta.cover) ? meta.cover : undefined}
          lrc={meta.lyric || undefined}
          name={meta.name}
          url={isSafeUrl(meta.audioUrl) ? meta.audioUrl : ''}
        />
      </div>
      <CardActionToolbar
        nodeKey={nodeKey}
        items={musicCardToolbarItems({
          onReplace: () => picker.open(nodeKey),
          onRemove: () => {
            editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
          },
        })}
      />
    </>
  )
}

export const musicPlayerCard = defineCard({
  nodeType: MUSIC_PLAYER_NODE_TYPE,
  baseNode: BaseMusicPlayerNode,
  decorateTarget: { width: 'regular' },
  insert: {},
  picker: {
    autoOpenOnInsert: true,
    render: (props) => <MusicCardPicker {...props} />,
  },
  menu: [
    {
      label: '音乐播放器',
      labelKey: 'host.music-player',
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
    return <MusicPlayerCardComponent meta={meta} nodeKey={node.getKey()} />
  },
})
