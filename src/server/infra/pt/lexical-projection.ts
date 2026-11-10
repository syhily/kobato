// Save-time body projections: `body_html` / `body_text` / `body_html_feed` are computed
// here from the canonical Lexical state, so SSR/RSS/search never pay the jsdom render per
// request. The columns are read-side derived data only — they never join the editor
// contract or the no-op-save equivalence check (which compares `body` alone).
//
// Imports inkling ONLY through the `./headless` entry: the `.` entry would inline the full
// ~2.5MB editor into the SEA binary.
//
// Host cards register here as BASE classes from the shared React-free specs
// (`@/shared/lexical/cards/`); solution / two-column override `getTextContent` because the
// generated one would leak raw markup into `body_text`.

import katex from 'katex'

import type { LexicalStateToHtmlOptions } from '@/inkling/headless'
import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { generateDecoratorNode, lexicalStateToHtml, lexicalStateToPlainText } from '@/inkling/headless'
import { getLogger } from '@/server/infra/logger'
import { KATEX_OPTIONS } from '@/server/infra/pt/katex'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { FEED_VARIANT_META_KIND } from '@/shared/lexical/cards/card-html'
import {
  IMAGE_RENDER_ENV_META_KIND,
  type KobatoImageRenderEnv,
  KOBATO_IMAGE_PROPERTIES,
  kobatoImageImportSpec,
  kobatoImageTextContent,
  renderKobatoImageNode,
} from '@/shared/lexical/cards/kobato-image'
import { MUSIC_PLAYER_CARD_PROPERTIES, renderMusicPlayerCard } from '@/shared/lexical/cards/music-player'
import { renderSolutionCard, SOLUTION_CARD_PROPERTIES, solutionCardTextContent } from '@/shared/lexical/cards/solution'
import {
  renderTwoColumnCard,
  TWO_COLUMN_CARD_PROPERTIES,
  twoColumnCardTextContent,
} from '@/shared/lexical/cards/two-column'
import {
  KOBATO_HOST_CARD_NODE_TYPES,
  MUSIC_PLAYER_NODE_TYPE,
  SOLUTION_NODE_TYPE,
  TWO_COLUMN_NODE_TYPE,
} from '@/shared/lexical/node-whitelist'
import { toProjectionState } from '@/shared/lexical/projection-state'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface BodyProjections {
  /** Full-fidelity HTML — SSR/public rendering. */
  bodyHtml: string
  /** Plain text — search corpus and revision diffs. */
  bodyText: string
  /** Feed-degraded HTML (math→TeX, code→plain pre, host-card substitution). */
  bodyHtmlFeed: string
}

class SolutionProjectionNode extends generateDecoratorNode({
  nodeType: SOLUTION_NODE_TYPE,
  properties: SOLUTION_CARD_PROPERTIES,
  defaultRenderFn: renderSolutionCard,
}) {
  override getTextContent() {
    return solutionCardTextContent(this)
  }
}

class TwoColumnProjectionNode extends generateDecoratorNode({
  nodeType: TWO_COLUMN_NODE_TYPE,
  properties: TWO_COLUMN_CARD_PROPERTIES,
  defaultRenderFn: renderTwoColumnCard,
}) {
  override getTextContent() {
    return twoColumnCardTextContent(this)
  }
}

class MusicPlayerProjectionNode extends generateDecoratorNode({
  nodeType: MUSIC_PLAYER_NODE_TYPE,
  properties: MUSIC_PLAYER_CARD_PROPERTIES,
  defaultRenderFn: renderMusicPlayerCard,
}) {}

/**
 * KobatoImageNode's projection twin: replaces DEFAULT_HTML_NODES' stock image baseNode by
 * same-type registration (a later entry wins), so `body_html` / `body_html_feed` carry the
 * kobato figure markup (layout classes, data-thumbhash, srcset) instead of the stock inkling
 * card. This headless class declares the full twelve-property spec directly — no nested
 * caption editor server-side, so the serialized caption HTML stays an opaque property.
 */
class KobatoImageProjectionNode extends generateDecoratorNode({
  nodeType: 'image',
  properties: KOBATO_IMAGE_PROPERTIES,
  defaultRenderFn: renderKobatoImageNode,
  importSpec: kobatoImageImportSpec,
  hasEditMode: false,
}) {
  override getTextContent() {
    return kobatoImageTextContent(this)
  }
}

/** The srcset facts of the full-fidelity pass — the same triple BlockImage reads from the
 *  settings contexts, resolved from the server-side snapshot. */
function imageRenderEnv(): KobatoImageRenderEnv {
  const assets = requireBlogSettingsSection('assets')
  return {
    assetHost: assets.asset.host,
    urlTemplate: assets.storage.urlTemplate,
    siteOrigin: requireBlogSettingsSection('siteIdentity').website,
  }
}

// The host cards register for every projection pass, so `toProjectionState` never
// substitutes them (that path remains the defense for types this module does not
// register). The class list and the renderable-type set derive from the same whitelist.
const PROJECTION_EXTRA_NODES: NonNullable<LexicalStateToHtmlOptions['nodes']> = [
  SolutionProjectionNode,
  TwoColumnProjectionNode,
  MusicPlayerProjectionNode,
  KobatoImageProjectionNode,
]
const RENDERABLE_HOST_CARD_TYPES: ReadonlySet<string> = new Set(KOBATO_HOST_CARD_NODE_TYPES)

// inkling's renderer swallows errors by default; the projection must fail
// fast instead (a swallowed parse error silently truncates the document).
function failFast(error: Error): never {
  throw error
}

function renderOptions(feed: boolean): LexicalStateToHtmlOptions {
  return {
    nodes: PROJECTION_EXTRA_NODES,
    onError: failFast,
    // The feed pass answers the card renderers through the open render-meta seam; the
    // full-fidelity pass leaves the kind unanswered. The image render env (srcset facts)
    // rides the same seam for BOTH passes — the full variant consumes the whole triple,
    // the feed variant only its siteOrigin.
    resolveRenderMeta: (kind) => {
      if (kind === FEED_VARIANT_META_KIND) {
        return feed ? true : undefined
      }
      if (kind === IMAGE_RENDER_ENV_META_KIND) {
        return imageRenderEnv()
      }
      return undefined
    },
    resolveExportPolicy: (key) => {
      if (key === 'footnotes-section-title') {
        return resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))
      }
      return undefined
    },
  }
}

/** The plain-text leg alone (`body_text`) — the search indexer and any caller that needs the
 *  corpus without paying for the two jsdom HTML passes. Throws on render failure, like
 *  {@link computeBodyProjections}. */
export function computeBodyText(state: LexicalEditorState): string {
  const renderable = toProjectionState(state, { feed: false, renderableHostCardTypes: RENDERABLE_HOST_CARD_TYPES })
  return lexicalStateToPlainText(renderable, { nodes: PROJECTION_EXTRA_NODES, onError: failFast })
}

/**
 * Computes all three projections of one canonical state. Throws on render
 * failure — the save pipeline catches and degrades to NULL columns (a save
 * must never fail because the projection did).
 */
export async function computeBodyProjections(state: LexicalEditorState): Promise<BodyProjections> {
  const renderable = toProjectionState(state, { feed: false, renderableHostCardTypes: RENDERABLE_HOST_CARD_TYPES })
  const feedState = toProjectionState(state, { feed: true, renderableHostCardTypes: RENDERABLE_HOST_CARD_TYPES })

  const bodyText = lexicalStateToPlainText(renderable, { nodes: PROJECTION_EXTRA_NODES, onError: failFast })
  const bodyHtml = await lexicalStateToHtml(renderable, renderOptions(false))
  const bodyHtmlFeed = await lexicalStateToHtml(feedState, renderOptions(true))

  return { bodyHtml, bodyText, bodyHtmlFeed }
}

/**
 * The comment row's `content` snapshot: the feed-variant degraded HTML of the comment state
 * (artifact slots stripped, codeblock → plain pre/code). Full-fidelity mathml/highlightedHtml
 * would bloat the column past the comment length cap and pollute substring search. Comment
 * node types are all covered by inkling's DEFAULT_HTML_NODES, so no extra nodes register here.
 *
 * One exception: ```math fences — the comment surface has no math card, so the fence IS the
 * formula authoring path. `renderCommentMathFences` converts every `codeblock[language=math]`
 * into a math node with a fresh display-mode KaTeX MathML artifact BEFORE rendering (after
 * the feed strip, so the artifact survives). Throws on render failure — the caller falls
 * back to plain text.
 */
export async function computeCommentContentProjection(state: LexicalEditorState): Promise<string> {
  const feedState = toProjectionState(state, { feed: true })
  renderCommentMathFences(feedState)
  return lexicalStateToHtml(feedState, { onError: failFast })
}

type MutableProjectionNode = Record<string, unknown> & { type: string; children?: LexicalNodeJson[] }

// Mutates the (already cloned) projection state. A KaTeX failure keeps the
// fence as a plain code block — degraded render, never fatal.
function renderCommentMathFences(state: LexicalEditorState): void {
  rewriteMathFences(unsafeCast<MutableProjectionNode>(state.root))
}

function rewriteMathFences(node: MutableProjectionNode): void {
  if (node.children === undefined) {
    return
  }
  node.children = node.children.map((child) => {
    const mutable = unsafeCast<MutableProjectionNode>(child)
    if (
      mutable.type === 'codeblock' &&
      mutable.language === 'math' &&
      typeof mutable.code === 'string' &&
      mutable.code.trim() !== ''
    ) {
      try {
        const mathml = katex.renderToString(mutable.code, { ...KATEX_OPTIONS, displayMode: true })
        return unsafeCast<LexicalNodeJson>({ type: 'math', version: 1, tex: mutable.code, mathml, svg: '' })
      } catch (err) {
        getLogger('pt.lexical-projection').warn('katex render failed for comment math fence', { error: String(err) })
      }
    }
    rewriteMathFences(mutable)
    return child
  })
}
