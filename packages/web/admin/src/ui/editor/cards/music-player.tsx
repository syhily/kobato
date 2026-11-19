import type { AdminMusicDto } from '@kobato/contracts/music.ts'

import {
  CardActionToolbar,
  type CardPickerRenderProps,
  type CardToolbarItem,
  defineCard,
  DELETE_CARD_COMMAND,
  generateDecoratorNode,
  useCardChrome,
  useCardPicker,
} from '@kobato/inkling'
import {
  hasMusicPlayerMeta,
  MUSIC_PLAYER_CARD_CLASSES,
  MUSIC_PLAYER_CARD_PROPERTIES,
  type MusicPlayerCardMeta,
  renderMusicPlayerCard,
} from '@kobato/lexical/cards/music-player.ts'
import { MUSIC_PLAYER_NODE_TYPE } from '@kobato/lexical/node-whitelist.ts'
import { isSafeUrl } from '@kobato/sanitize/sanitize-url.ts'
import { useI18n, type I18nValue } from '@kobato/ui/lib/I18nProvider.tsx'
import { inklingHostCardMatches } from '@kobato/web-admin/ui/editor/cards/menu-matches.ts'
import { MusicPickerDialog } from '@kobato/web-admin/ui/editor/pickers/MusicPickerDialog.tsx'
import { MusicPlayerCard } from '@kobato/web-public/ui/music-player/music-player.tsx'
import { Music2Icon } from 'lucide-react'

export const BaseMusicPlayerNode = class extends generateDecoratorNode({
  nodeType: MUSIC_PLAYER_NODE_TYPE,
  properties: MUSIC_PLAYER_CARD_PROPERTIES,
  defaultRenderFn: renderMusicPlayerCard,
}) {}

export type MusicPlayerCardNode = InstanceType<typeof BaseMusicPlayerNode>

function isMusicPlayerCardNode(node: unknown): node is MusicPlayerCardNode {
  return node instanceof BaseMusicPlayerNode
}

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

export function musicCardToolbarItems(
  {
    onReplace,
    onRemove,
  }: {
    onReplace: () => void
    onRemove: () => void
  },
  t: I18nValue['t'],
): CardToolbarItem[] {
  return [
    {
      kind: 'custom',
      icon: 'replace',
      label: t('admin.editor.cards.music.replace'),
      dataTestId: 'replace-music-track',
      onClick: (event) => {
        event.stopPropagation()
        onReplace()
      },
    },
    {
      kind: 'custom',
      icon: 'trash',
      label: t('admin.editor.cards.music.remove'),
      dataTestId: 'remove-music-card',
      onClick: (event) => {
        event.stopPropagation()
        onRemove()
      },
    },
  ]
}

// The component renders from a PLAIN meta snapshot and never touches the node
// instance: the generated property getters call getLatest(), which throws when
// React re-renders outside Lexical's commit or against a node instance a later edit
// already replaced (Lexical #195). Reading the dataset inside `render(node)` below
// is safe because decorate() runs inside the reconciler's active read. Everything
// the pick seam and the chrome need crosses as the node KEY.
export function MusicPlayerCardComponent({ meta, nodeKey }: { meta: MusicPlayerCardMeta; nodeKey: string }) {
  const { t } = useI18n()
  const picker = useCardPicker()
  const { editor } = useCardChrome(nodeKey, isMusicPlayerCardNode)

  if (!hasMusicPlayerMeta(meta)) {
    const label =
      meta.playerId === ''
        ? t('admin.editor.cards.music.placeholder')
        : t('admin.editor.cards.music.placeholderResolved', { playerId: meta.playerId })
    return (
      <div className={MUSIC_PLAYER_CARD_CLASSES.wrapper}>
        <button
          type="button"
          className="flex h-20 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-ink-3 transition hover:border-brand/60 hover:text-ink-1"
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
        items={musicCardToolbarItems(
          {
            onReplace: () => picker.open(nodeKey),
            onRemove: () => {
              editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
            },
          },
          t,
        )}
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
      label: 'Music player',
      labelKey: 'host.music-player',
      desc: 'Embed a song from the music library',
      icon: Music2Icon,
      command: 'insert',
      insertParams: {},
      matches: [...inklingHostCardMatches.musicPlayer],
      priority: 19,
    },
  ],
  toolbarLabel: MUSIC_PLAYER_NODE_TYPE,
  render(node) {
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
