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

import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BaseMusicPlayerNode, MusicPlayerCardView, musicPlayerCard } from '@/client/editor/cards/music-player'
import { BaseSolutionNode, SolutionCardView, solutionCard } from '@/client/editor/cards/solution'
import {
  BaseTwoColumnNode,
  TwoColumnCardView,
  TwoColumnPaneView,
  twoColumnCard,
} from '@/client/editor/cards/two-column'
import { MUSIC_PLAYER_META_KEYS } from '@/shared/lexical/artifacts'
import { type CardRenderContext, FEED_VARIANT_META_KIND } from '@/shared/lexical/cards/card-html'
import {
  MUSIC_PLAYER_CARD_CLASSES,
  MUSIC_PLAYER_CARD_PROPERTIES,
  type MusicPlayerCardMeta,
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

function outerHtml(output: { element: unknown }): string {
  return (output.element as HTMLElement).outerHTML
}

describe('host card parity — solution', () => {
  it('renders the same chrome markup on the canvas and in the export', () => {
    const canvas = renderToStaticMarkup(
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
    const canvas = renderToStaticMarkup(
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

  it('renders the same preview markup on the canvas and in the export fallback', () => {
    const canvas = renderToStaticMarkup(<MusicPlayerCardView meta={META} />)
    const exported = `<div class="${MUSIC_PLAYER_CARD_CLASSES.wrapper}">${musicPlayerFallbackHtml(META, escapeText)}</div>`
    expect(normalized(canvas)).toBe(normalized(exported))
  })

  it('renders the glyph placeholder for a missing cover on both states', () => {
    const meta = { ...META, cover: '' }
    const canvas = renderToStaticMarkup(<MusicPlayerCardView meta={meta} />)
    const exported = `<div class="${MUSIC_PLAYER_CARD_CLASSES.wrapper}">${musicPlayerFallbackHtml(meta, escapeText)}</div>`
    expect(normalized(canvas)).toBe(normalized(exported))
    expect(canvas).toContain(MUSIC_PLAYER_CARD_CLASSES.fallbackGlyph)
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
