// The WYSIWYG parity gate for the R10 host cards (plan
// docs/plans/inkling-editor-replacement.md): each card's decorate chrome
// (what the canvas shows) must match the exportDOM markup the shared spec
// renderers produce for the save-time projection (what `body_html` carries
// and R13 renders publicly). Both sides derive from the same class/copy
// constants in `@/shared/lexical/cards/`; this file proves the assembly by
// rendering the React chrome (renderToStaticMarkup) and the shared renderers
// (a stub RenderContext over jsdom) and comparing the DOM-normalized markup.
//
// The card modules' top-level `defineCard` calls run on import — pure
// registry writes, safe under the node environment.
//
// The composer context is mocked with a real headless editor (the barrel's
// `createHeadlessEditor`) because the music card's component and picker now
// ride the inkling pick seam (`useCardPicker` / `useCardChrome`), which reads
// the composer context. The picker dialog itself is stubbed — its props are
// the pick seam's observable boundary.

// @vitest-environment jsdom

import type { ReactElement } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { act, render } from '@testing-library/react'
import { JSDOM } from 'jsdom'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MusicPickerDialogProps } from '@/ui/admin/editor/pickers/MusicPickerDialog'

import { makeAdminMusic } from '#/_helpers/catalog'
import { tZhCN, makeTranslator } from '#/_helpers/i18n'
import { wrapWithI18n } from '#/_helpers/i18n-render'
import {
  BaseMusicPlayerNode,
  MusicCardPicker,
  musicCardToolbarItems,
  MusicPlayerCardComponent,
  musicPickMeta,
  musicPlayerCard,
} from '@/client/editor/cards/music-player'
import { BaseSolutionNode, SolutionCardView, solutionCard } from '@/client/editor/cards/solution'
import {
  BaseTwoColumnNode,
  TwoColumnCardView,
  TwoColumnPaneView,
  twoColumnCard,
} from '@/client/editor/cards/two-column'
import { createHeadlessEditor } from '@/inkling'
import { lookupLabel, resolveLabels } from '@/inkling/labels/inkling-labels'
import { getHostCard } from '@/inkling/nodes/cards/host-card-registry'
import { inklingLabelsFor } from '@/shared/i18n/inkling-labels'
import { MUSIC_PLAYER_META_KEYS } from '@/shared/lexical/artifacts'
import { type CardRenderContext, FEED_VARIANT_META_KIND } from '@/shared/lexical/cards/card-html'
import {
  MUSIC_PLAYER_CARD_CLASSES,
  MUSIC_PLAYER_CARD_PROPERTIES,
  type MusicPlayerCardMeta,
  musicPlayerCardMeta,
  musicPlayerFallbackHtml,
  renderMusicPlayerCard,
} from '@/shared/lexical/cards/music-player'
import {
  renderSolutionCard,
  SOLUTION_CARD_CLASSES,
  SOLUTION_CARD_PROPERTIES,
  SOLUTION_NESTED_EDITOR,
} from '@/shared/lexical/cards/solution'
import {
  renderTwoColumnCard,
  TWO_COLUMN_CARD_CLASSES,
  TWO_COLUMN_CARD_PROPERTIES,
  TWO_COLUMN_NESTED_EDITORS,
} from '@/shared/lexical/cards/two-column'
import { MUSIC_PLAYER_NODE_TYPE, SOLUTION_NODE_TYPE, TWO_COLUMN_NODE_TYPE } from '@/shared/lexical/node-whitelist'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

// The dialog is host chrome around an oRPC list — stub it and capture the
// props the picker render hands it (open/onOpenChange/onPick are the seam).
const musicPickerDialogProps: { current: MusicPickerDialogProps | null } = { current: null }
vi.mock('@/ui/admin/editor/pickers/MusicPickerDialog', () => ({
  MusicPickerDialog: (props: MusicPickerDialogProps) => {
    musicPickerDialogProps.current = props
    return null
  },
}))

// One shared headless editor stands in for the composer context; the pick
// tests insert real music-player nodes into it.
const sharedEditor: LexicalEditor = createHeadlessEditor({ nodes: [musicPlayerCard.node], onError: () => {} })
vi.mocked(useLexicalComposerContext).mockReturnValue([sharedEditor, { getTheme: () => null }])

const dom = new JSDOM('')

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The render-context fields the host-card renderers touch, identity-style
 * (sanitization/URL policy are pinned separately by the projection tests). */
function stubContext(feed = false): CardRenderContext {
  return {
    createDocument: () => dom.window.document,
    sanitizeBasicHtml: (html: string) => html,
    escapeText,
    safeUrl: (_kind, value) => value,
    resolveRenderMeta: feed ? (kind) => (kind === FEED_VARIANT_META_KIND ? true : undefined) : undefined,
  }
}

/** Serializes markup through jsdom so void-tag/boolean-attribute spelling
 * differences between React and the template strings normalize away. React
 * 19's static renderer hoists `<link rel="preload" as="image">` for `<img>`
 * tags — an SSR fetch hint, not chrome markup — so those are stripped. */
function normalized(html: string): string {
  const body = new JSDOM(`<body>${html}</body>`).window.document.body
  for (const link of body.querySelectorAll('link[rel="preload"]')) {
    link.remove()
  }
  return body.innerHTML
}

/** SSR render through the root i18n provider (the card chrome calls `useI18n`). */
function renderHtml(node: ReactElement): string {
  return renderToStaticMarkup(wrapWithI18n(node))
}

/** Client render through the root i18n provider. */
function renderClient(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}

function outerHtml(output: { element: unknown }): string {
  return (output.element as HTMLElement).outerHTML
}

describe('host card parity — solution', () => {
  it('renders the same chrome markup on the canvas and in the export', () => {
    const canvas = renderHtml(
      <SolutionCardView>
        <p data-parity-marker="" />
      </SolutionCardView>,
    )
    const exported = renderSolutionCard({ content: '<p data-parity-marker=""></p>' }, stubContext())
    expect(exported.type).toBe('outer')
    expect(normalized(canvas)).toBe(normalized(outerHtml(exported)))
  })

  it('exports the shared class/copy constants and unwraps for the feed', () => {
    const full = renderSolutionCard({ content: '<p>a</p>' }, stubContext())
    const html = outerHtml(full)
    expect(html).toContain(`class="${SOLUTION_CARD_CLASSES.root}"`)
    expect(html).toContain(SOLUTION_CARD_CLASSES.begin)
    expect(html).toContain(SOLUTION_CARD_CLASSES.qed)
    const feed = renderSolutionCard({ content: '<p>a</p>' }, stubContext(true))
    expect(feed.type).toBe('inner')
    expect(normalized((feed.element as HTMLElement).innerHTML)).toBe('<p>a</p>')
  })

  it('pins the card assembly to the whitelist type and the shared spec', () => {
    expect(solutionCard.nodeType).toBe(SOLUTION_NODE_TYPE)
    // The assembled class subclasses our base (assembleCardNodeOnce).
    expect(solutionCard.node.prototype).toBeInstanceOf(BaseSolutionNode)
    expect(SOLUTION_NESTED_EDITOR.serializedKey).toBe(SOLUTION_CARD_PROPERTIES[0]!.name)
  })
})

describe('host card parity — two-column', () => {
  it('renders the same chrome markup on the canvas and in the export', () => {
    const canvas = renderHtml(
      <TwoColumnCardView
        left={
          <TwoColumnPaneView side="left">
            <p data-parity-marker="left" />
          </TwoColumnPaneView>
        }
        right={
          <TwoColumnPaneView side="right">
            <p data-parity-marker="right" />
          </TwoColumnPaneView>
        }
      />,
    )
    const exported = renderTwoColumnCard(
      { left: '<p data-parity-marker="left"></p>', right: '<p data-parity-marker="right"></p>' },
      stubContext(),
    )
    expect(exported.type).toBe('outer')
    expect(normalized(canvas)).toBe(normalized(outerHtml(exported)))
  })

  it('exports the shared classes and flattens for the feed', () => {
    const full = renderTwoColumnCard({ left: '<p>L</p>', right: '<p>R</p>' }, stubContext())
    const html = outerHtml(full)
    expect(html).toContain(`class="${TWO_COLUMN_CARD_CLASSES.root}"`)
    expect(html).toContain('data-pt-two-column=""')
    expect(html).toContain('data-side="left"')
    expect(html).toContain('data-side="right"')
    const feed = renderTwoColumnCard({ left: '<p>L</p>', right: '<p>R</p>' }, stubContext(true))
    expect(feed.type).toBe('inner')
    expect(normalized((feed.element as HTMLElement).innerHTML)).toBe('<p>L</p><p>R</p>')
  })

  it('pins the card assembly to the whitelist type and the shared spec', () => {
    expect(twoColumnCard.nodeType).toBe(TWO_COLUMN_NODE_TYPE)
    expect(twoColumnCard.node.prototype).toBeInstanceOf(BaseTwoColumnNode)
    expect(TWO_COLUMN_NESTED_EDITORS.map((spec) => spec.serializedKey)).toEqual(
      TWO_COLUMN_CARD_PROPERTIES.map((property) => property.name),
    )
  })
})

describe('host card parity — music-player', () => {
  const META: MusicPlayerCardMeta = {
    playerId: 'p1',
    name: 'Song',
    artist: 'Artist',
    cover: '/storage/music/cover.png',
    audioUrl: '/storage/music/song.mp3',
    lyric: 'la-la',
  }

  it('renders the playable player on the canvas for a resolved card', () => {
    const canvas = renderHtml(<MusicPlayerCardComponent meta={META} nodeKey="test-key" />)
    expect(canvas).toContain('Song')
    expect(canvas).toContain('Artist')
    expect(canvas).toContain('/storage/music/cover.png')
    expect(canvas).toContain('aria-label="播放"')
    expect(canvas).toContain('00:00')
    expect(canvas).toContain('--:--')
  })

  it('renders the pick placeholder on the canvas for an unresolved card', () => {
    const meta: MusicPlayerCardMeta = { playerId: '', name: '', artist: '', cover: '', audioUrl: '', lyric: '' }
    const canvas = renderHtml(<MusicPlayerCardComponent meta={meta} nodeKey="test-key" />)
    expect(canvas).toContain('音乐播放器')
    expect(canvas).not.toContain('aria-label="播放"')
  })

  it('localizes the pick placeholder', () => {
    const empty: MusicPlayerCardMeta = { playerId: '', name: '', artist: '', cover: '', audioUrl: '', lyric: '' }
    const unresolved = renderToStaticMarkup(
      wrapWithI18n(<MusicPlayerCardComponent meta={empty} nodeKey="test-key" />, { locale: 'en-US' }),
    )
    expect(unresolved).toContain('Music player · click to choose a song')

    const pending = renderToStaticMarkup(
      wrapWithI18n(<MusicPlayerCardComponent meta={{ ...empty, playerId: 'p9' }} nodeKey="test-key" />),
    )
    expect(pending).toContain('音乐播放器 · p9（保存时解析）')
  })

  it('keeps the export fallback aligned with the player paused state', () => {
    // The byte-level parity lives in tests/unit/ui/public/music-player —
    // here we only pin that the export fallback still ships the shared
    // structure the hydration hook replaces.
    const exported = musicPlayerFallbackHtml(META, escapeText)
    expect(exported).toContain(MUSIC_PLAYER_CARD_CLASSES.fallbackBody)
    expect(exported).toContain(MUSIC_PLAYER_CARD_CLASSES.fallbackProgress)
    expect(exported).toContain('data-music-player-fallback')
  })

  it('exports the aplayer mount point with the meta snapshot and degrades for the feed', () => {
    const full = renderMusicPlayerCard(META, stubContext())
    expect(full.type).toBe('outer')
    const html = outerHtml(full)
    expect(html).toContain(`class="${MUSIC_PLAYER_CARD_CLASSES.wrapper}"`)
    expect(html).toContain('class="aplayer"')
    expect(html).toContain('data-id="p1"')
    expect(html).toContain('data-name="Song"')
    expect(html).toContain('data-artist="Artist"')
    expect(html).toContain('data-url="/storage/music/song.mp3"')
    expect(html).toContain('data-cover="/storage/music/cover.png"')
    expect(html).toContain('data-lrc="la-la"')
    expect(html).toContain('data-music-player-fallback=""')
    const feed = renderMusicPlayerCard(META, stubContext(true))
    expect(outerHtml(feed)).toContain('<figure>')
    expect(outerHtml(feed)).toContain('<figcaption>🎵 Song — Artist</figcaption>')
  })

  it('pins the card assembly to the whitelist type and the meta-snapshot contract', () => {
    expect(musicPlayerCard.nodeType).toBe(MUSIC_PLAYER_NODE_TYPE)
    expect(musicPlayerCard.node.prototype).toBeInstanceOf(BaseMusicPlayerNode)
    // The dataset is playerId plus exactly the server-owned meta keys.
    expect(MUSIC_PLAYER_CARD_PROPERTIES.map((property) => property.name)).toEqual([
      'playerId',
      ...MUSIC_PLAYER_META_KEYS,
    ])
  })
})

describe('music-player pick seam', () => {
  /** Inserts one empty music-player node into the shared editor; resolves its key after commit. */
  async function insertMusicNode(): Promise<string> {
    let key = ''
    await new Promise<void>((resolve) => {
      sharedEditor.update(
        () => {
          const node = new musicPlayerCard.node({})
          $getRoot().append(node)
          key = node.getKey()
        },
        { onUpdate: () => resolve() },
      )
    })
    return key
  }

  /** The node's meta snapshot, read inside an editor-state read. */
  function readMusicMeta(nodeKey: string): MusicPlayerCardMeta | null {
    return sharedEditor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      return node instanceof BaseMusicPlayerNode ? musicPlayerCardMeta(node) : null
    })
  }

  beforeEach(() => {
    musicPickerDialogProps.current = null
  })

  it('maps the admin DTO onto the meta snapshot', () => {
    expect(
      musicPickMeta(
        makeAdminMusic({
          playerId: 'p1',
          name: 'Song',
          artist: ['周杰伦', '费玉清'],
          coverUrl: '/storage/music/cover.png',
          audioUrl: '/storage/music/song.mp3',
          lyric: null,
        }),
      ),
    ).toEqual({
      playerId: 'p1',
      name: 'Song',
      // the library's packed ' / ' artist form, matching the save-time snapshot
      artist: '周杰伦 / 费玉清',
      cover: '/storage/music/cover.png',
      audioUrl: '/storage/music/song.mp3',
      lyric: '',
    })
  })

  it('writes playerId and the full meta snapshot onto the node at pick time', async () => {
    const nodeKey = await insertMusicNode()
    expect(readMusicMeta(nodeKey)?.audioUrl).toBe('')

    const close = vi.fn()
    renderClient(<MusicCardPicker editor={sharedEditor} nodeKey={nodeKey} close={close} />)
    const onPick = musicPickerDialogProps.current?.onPick
    expect(onPick).toBeDefined()

    await act(async () => {
      onPick?.(
        makeAdminMusic({
          playerId: 'p9',
          name: 'Picked Song',
          artist: ['Artist A', 'Artist B'],
          coverUrl: '/storage/music/picked.png',
          audioUrl: '/storage/music/picked.mp3',
          lyric: '[00:01.00]hi',
        }),
      )
      // Lexical 0.46 commits the pick write on a microtask — drain it
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // the freshly picked card renders the playable player immediately
    expect(readMusicMeta(nodeKey)).toEqual({
      playerId: 'p9',
      name: 'Picked Song',
      artist: 'Artist A / Artist B',
      cover: '/storage/music/picked.png',
      audioUrl: '/storage/music/picked.mp3',
      lyric: '[00:01.00]hi',
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes without writing when the dialog is dismissed', async () => {
    const nodeKey = await insertMusicNode()
    const close = vi.fn()
    renderClient(<MusicCardPicker editor={sharedEditor} nodeKey={nodeKey} close={close} />)

    act(() => {
      musicPickerDialogProps.current?.onOpenChange?.(false)
    })

    expect(close).toHaveBeenCalledTimes(1)
    expect(readMusicMeta(nodeKey)?.playerId).toBe('')
  })

  it('no-ops the pick write when the card was deleted while the dialog was open', async () => {
    const nodeKey = await insertMusicNode()
    const close = vi.fn()
    renderClient(<MusicCardPicker editor={sharedEditor} nodeKey={nodeKey} close={close} />)
    await new Promise<void>((resolve) => {
      sharedEditor.update(
        () => {
          $getNodeByKey(nodeKey)?.remove()
        },
        { onUpdate: () => resolve() },
      )
    })

    expect(readMusicMeta(nodeKey)).toBeNull()
    expect(() =>
      act(() => {
        musicPickerDialogProps.current?.onPick(makeAdminMusic())
      }),
    ).not.toThrow()
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('host card menu copy', () => {
  // The card specs carry English fallbacks (the label the overlay uses when a
  // locale table has no override); the active locale's label table supplies the
  // other languages through `labelKey`. A spec must never bake a locale in.
  const CARDS = [
    {
      nodeType: SOLUTION_NODE_TYPE,
      label: 'Solution block',
      desc: 'Q&A / hint (format-rich, same as a quote)',
      zhLabel: '解答块',
      zhDesc: '题解 / 提示（内部可排版，与引用块相同）',
    },
    {
      nodeType: TWO_COLUMN_NODE_TYPE,
      label: 'Two columns',
      desc: 'Two side-by-side columns, each edited independently',
      zhLabel: '左右分栏',
      zhDesc: '两栏并排，每栏内容独立编辑',
    },
    {
      nodeType: MUSIC_PLAYER_NODE_TYPE,
      label: 'Music player',
      desc: 'Embed a song from the music library',
      zhLabel: '音乐播放器',
      zhDesc: '嵌入一首音乐库中的歌曲',
    },
  ] as const

  it('keeps the English fallback in the spec and localizes through labelKey', () => {
    const zh = resolveLabels(inklingLabelsFor('zh-CN'))
    const en = resolveLabels(inklingLabelsFor('en-US'))

    for (const card of CARDS) {
      const entry = getHostCard(card.nodeType)?.spec.menu?.[0]
      expect(entry?.label).toBe(card.label)
      expect(entry?.desc).toBe(card.desc)
      expect(entry?.labelKey).toBeDefined()

      // The overlay key exists in both tables: the fallback never renders for
      // a supported locale.
      const prefix = `menu.${entry?.labelKey}`
      expect(lookupLabel(zh, `${prefix}.label`, card.label)).toBe(card.zhLabel)
      expect(lookupLabel(zh, `${prefix}.desc`, card.desc)).toBe(card.zhDesc)
      expect(lookupLabel(en, `${prefix}.label`, card.label)).toBe(card.label)
    }
  })
})

describe('music-player editing chrome', () => {
  it('declares replace and remove items wired to the pick seam and card deletion', () => {
    const onReplace = vi.fn()
    const onRemove = vi.fn()
    const items = musicCardToolbarItems({ onReplace, onRemove }, tZhCN)

    expect(items).toHaveLength(2)
    const [replace, remove] = items
    expect(replace).toMatchObject({
      kind: 'custom',
      icon: 'replace',
      label: '更换歌曲',
      dataTestId: 'replace-music-track',
    })
    expect(remove).toMatchObject({
      kind: 'custom',
      icon: 'trash',
      label: '删除播放器',
      dataTestId: 'remove-music-card',
    })

    // the click handlers stop propagation (the wrapper's selection would
    // otherwise fire) and invoke the affordance
    const event = { stopPropagation: vi.fn() } as unknown as React.MouseEvent
    if (replace?.kind === 'custom') {
      replace.onClick(event)
    }
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(onReplace).toHaveBeenCalledTimes(1)
    if (remove?.kind === 'custom') {
      remove.onClick(event)
    }
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('localizes the replace/remove affordances', () => {
    const items = musicCardToolbarItems({ onReplace: vi.fn(), onRemove: vi.fn() }, makeTranslator('en-US'))

    expect(items.map((item) => (item.kind === 'custom' ? item.label : ''))).toEqual(['Change song', 'Remove player'])
  })
})
