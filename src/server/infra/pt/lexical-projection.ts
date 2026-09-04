// Save-time body projections (plan docs/plans/inkling-editor-replacement.md,
// round R9b): the three `content` table columns `body_html` / `body_text` /
// `body_html_feed` are computed here from the canonical Lexical state and
// written by the save pipeline, so SSR/RSS/search never pay the jsdom render
// per request. The columns are read-side derived data only — they never join
// the editor contract or the equivalence check (`equivalence.ts` compares
// `body` alone).
//
// Imports inkling ONLY through the `./headless` entry (the root AGENTS.md
// dependency rule: the server bundle must stay on the headless subgraph; the
// `.` entry would inline the full 2.5MB editor into the SEA binary).
//
// R10 host cards: the three kobato cards register here as BASE classes built
// from the shared React-free specs (`@/shared/lexical/cards/`) through the
// headless `generateDecoratorNode` — the same pattern inkling's own headless
// surface uses (DEFAULT_HTML_NODES registers every built-in card's
// `baseNode`). Spec-less classes: no nested-editor/transient statics, so
// parsing never constructs nested editors (the serializedKey HTML is an
// opaque property server-side; the client-side assembled classes own the
// nested-editor trilogy). solution / two-column override `getTextContent`
// because the generated one would leak raw markup into `body_text` (no live
// nested editor to prefer headless-side).

import type { LexicalStateToHtmlOptions } from '@inkling/editor/headless'

import { generateDecoratorNode, lexicalStateToHtml, lexicalStateToPlainText } from '@inkling/editor/headless'

import type { LexicalEditorState } from '@/shared/lexical/schema'

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

export interface BodyProjections {
  /** Full-fidelity HTML — SSR/public rendering (R13 consumes). */
  bodyHtml: string
  /** Plain text — search corpus and revision diffs (R14 consumes). */
  bodyText: string
  /** Feed-degraded HTML matching the PT rssMode semantics (R14 consumes). */
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
 * KobatoImageNode's projection twin (R11): replaces DEFAULT_HTML_NODES'
 * stock image baseNode by same-type registration (a later entry wins), so
 * `body_html`/`body_html_feed` carry the kobato figure markup (layout
 * classes, data-thumbhash, srcset) instead of the stock inkling card. The
 * client editing class is a subclass of the assembled stock ImageNode; this
 * headless class declares the full twelve-property spec directly (no nested
 * caption editor server-side — the serialized caption HTML is an opaque
 * property here, matching the solution/two-column precedent).
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

/**
 * The srcset facts of the full-fidelity pass — the same triple BlockImage
 * reads from the settings contexts, resolved from the server-side snapshot.
 */
function imageRenderEnv(): KobatoImageRenderEnv {
  const assets = requireBlogSettingsSection('assets')
  return {
    assetHost: assets.asset.host,
    urlTemplate: assets.storage.urlTemplate,
    siteOrigin: requireBlogSettingsSection('siteIdentity').website,
  }
}

// The three host cards are registered for every projection pass, so
// `toProjectionState` never substitutes them (the substitution path stays as
// defense for types this module does not register). Both lists move together
// by construction: the set derives from the same whitelist the classes
// serialize.
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
    // The feed pass tells the card renderers through the open render-meta
    // seam (the export-policy key set is closed); the full-fidelity pass
    // leaves the kind unanswered. The image render env (srcset facts) rides
    // the same seam — answered for BOTH passes: the full variant consumes
    // the whole triple, the feed variant only its siteOrigin.
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
      // Footnotes section heading — the same source `pt-html.ts` reads.
      if (key === 'footnotes-section-title') {
        return resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))
      }
      return undefined
    },
  }
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
