import { CardActionToolbar, type CardToolbarItem } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import {
  hasMusicPlayerMeta,
  MUSIC_PLAYER_CARD_CLASSES,
  MUSIC_PLAYER_CARD_PROPERTIES,
  type MusicPlayerCardMeta,
  renderMusicPlayerCard,
} from '@kobato/inkling-internal/headless/cards/music-player.ts'
import { MUSIC_PLAYER_NODE_TYPE } from '@kobato/inkling-internal/headless/node-whitelist.ts'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import { useCardPicker } from '@kobato/inkling-internal/hooks/useCardPicker'
import { inklingHostCardMatches } from '@kobato/inkling-internal/host-cards/menu-matches.ts'
import { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { defineCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
import { DELETE_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { isSafeUrl } from '@kobato/sanitize/sanitize-url.ts'
import { MusicPlayerCard } from '@kobato/ui/components/music-player/music-player.tsx'
import { useI18n, type I18nValue } from '@kobato/ui/lib/I18nProvider.tsx'
import { Music2Icon } from 'lucide-react'

export const BaseMusicPlayerNode = class extends generateDecoratorNode({
  nodeType: MUSIC_PLAYER_NODE_TYPE,
  properties: MUSIC_PLAYER_CARD_PROPERTIES,
  defaultRenderFn: renderMusicPlayerCard,
}) {}

export type MusicPlayerCardNode = InstanceType<typeof BaseMusicPlayerNode>

export function isMusicPlayerCardNode(node: unknown): node is MusicPlayerCardNode {
  return node instanceof BaseMusicPlayerNode
}

// The picker DIALOG is host data flow (it queries the music library over RPC),
// so it stays in the host: web-admin registers it through the pick seam
// (`registerCardPicker`, with `autoOpenOnInsert`). The card here only opens the
// registered picker by node KEY.
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
