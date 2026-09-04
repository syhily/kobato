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

import type { LexicalStateToHtmlOptions } from '@inkling/editor/headless'

import { lexicalStateToHtml, lexicalStateToPlainText } from '@inkling/editor/headless'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { requireBlogSettingsSection } from '@/shared/config/getters'
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

// R10 evolution point: once the three host cards land via `defineCard`,
// register their (headless-safe) node classes here AND add their type strings
// to RENDERABLE_HOST_CARD_TYPES so `toProjectionState` stops substituting
// them. Both lists must move together.
const PROJECTION_EXTRA_NODES: NonNullable<LexicalStateToHtmlOptions['nodes']> = []
const RENDERABLE_HOST_CARD_TYPES: ReadonlySet<string> = new Set()

// inkling's renderer swallows errors by default; the projection must fail
// fast instead (a swallowed parse error silently truncates the document).
function failFast(error: Error): never {
  throw error
}

function renderOptions(): LexicalStateToHtmlOptions {
  return {
    nodes: PROJECTION_EXTRA_NODES,
    onError: failFast,
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

  const options = renderOptions()
  const bodyText = lexicalStateToPlainText(renderable, { nodes: PROJECTION_EXTRA_NODES, onError: failFast })
  const bodyHtml = await lexicalStateToHtml(renderable, options)
  const bodyHtmlFeed = await lexicalStateToHtml(feedState, options)

  return { bodyHtml, bodyText, bodyHtmlFeed }
}
