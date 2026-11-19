import type { LexicalStateToHtmlOptions } from '@kobato/inkling/headless'
import type { LexicalEditorState, LexicalNodeJson } from '@kobato/lexical/schema.ts'

import { generateDecoratorNode, lexicalStateToHtml, lexicalStateToPlainText } from '@kobato/inkling/headless'
import { FEED_VARIANT_META_KIND } from '@kobato/lexical/cards/card-html.ts'
import {
  IMAGE_RENDER_ENV_META_KIND,
  type KobatoImageRenderEnv,
  KOBATO_IMAGE_PROPERTIES,
  kobatoImageImportSpec,
  kobatoImageTextContent,
  renderKobatoImageNode,
} from '@kobato/lexical/cards/kobato-image.ts'
import { MUSIC_PLAYER_CARD_PROPERTIES, renderMusicPlayerCard } from '@kobato/lexical/cards/music-player.ts'
import {
  renderSolutionCard,
  SOLUTION_CARD_PROPERTIES,
  solutionCardTextContent,
} from '@kobato/lexical/cards/solution.ts'
import {
  renderTwoColumnCard,
  TWO_COLUMN_CARD_PROPERTIES,
  twoColumnCardTextContent,
} from '@kobato/lexical/cards/two-column.ts'
import {
  KOBATO_HOST_CARD_NODE_TYPES,
  MUSIC_PLAYER_NODE_TYPE,
  SOLUTION_NODE_TYPE,
  TWO_COLUMN_NODE_TYPE,
} from '@kobato/lexical/node-whitelist.ts'
import { toProjectionState } from '@kobato/lexical/projection-state.ts'
import { KATEX_OPTIONS } from '@kobato/server/infra/lexical/katex.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { resolveFootnotesSectionTitle } from '@kobato/settings/presentation.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import katex from 'katex'

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

function imageRenderEnv(): KobatoImageRenderEnv {
  const assets = requireBlogSettingsSection('assets')
  return {
    assetHost: assets.asset.host,
    urlTemplate: assets.storage.urlTemplate,
    siteOrigin: requireBlogSettingsSection('siteIdentity').website,
  }
}

const PROJECTION_EXTRA_NODES: NonNullable<LexicalStateToHtmlOptions['nodes']> = [
  SolutionProjectionNode,
  TwoColumnProjectionNode,
  MusicPlayerProjectionNode,
  KobatoImageProjectionNode,
]
const RENDERABLE_HOST_CARD_TYPES: ReadonlySet<string> = new Set(KOBATO_HOST_CARD_NODE_TYPES)

function failFast(error: Error): never {
  throw error
}

function renderOptions(feed: boolean): LexicalStateToHtmlOptions {
  return {
    nodes: PROJECTION_EXTRA_NODES,
    onError: failFast,
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

export function computeBodyText(state: LexicalEditorState): string {
  const renderable = toProjectionState(state, { feed: false, renderableHostCardTypes: RENDERABLE_HOST_CARD_TYPES })
  return lexicalStateToPlainText(renderable, { nodes: PROJECTION_EXTRA_NODES, onError: failFast })
}

export async function computeBodyProjections(state: LexicalEditorState): Promise<BodyProjections> {
  const renderable = toProjectionState(state, { feed: false, renderableHostCardTypes: RENDERABLE_HOST_CARD_TYPES })
  const feedState = toProjectionState(state, { feed: true, renderableHostCardTypes: RENDERABLE_HOST_CARD_TYPES })

  const bodyText = lexicalStateToPlainText(renderable, { nodes: PROJECTION_EXTRA_NODES, onError: failFast })
  const bodyHtml = await lexicalStateToHtml(renderable, renderOptions(false))
  const bodyHtmlFeed = await lexicalStateToHtml(feedState, renderOptions(true))

  return { bodyHtml, bodyText, bodyHtmlFeed }
}

export async function computeCommentContentProjection(state: LexicalEditorState): Promise<string> {
  const feedState = toProjectionState(state, { feed: true })
  renderCommentMathFences(feedState)
  return lexicalStateToHtml(feedState, { onError: failFast })
}

type MutableProjectionNode = Record<string, unknown> & { type: string; children?: LexicalNodeJson[] }

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
        getLogger('lexical.projection').warn('katex render failed for comment math fence', { error: String(err) })
      }
    }
    rewriteMathFences(mutable)
    return child
  })
}
