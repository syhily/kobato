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

// The three host cards are registered for every projection pass, so
// `toProjectionState` never substitutes them (the substitution path stays as
// defense for types this module does not register). Both lists move together
// by construction: the set derives from the same whitelist the classes
// serialize.
const PROJECTION_EXTRA_NODES: NonNullable<LexicalStateToHtmlOptions['nodes']> = [
  SolutionProjectionNode,
  TwoColumnProjectionNode,
  MusicPlayerProjectionNode,
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
    // leaves the kind unanswered.
    resolveRenderMeta: feed ? (kind) => (kind === FEED_VARIANT_META_KIND ? true : undefined) : undefined,
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
