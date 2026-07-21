/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { toHTML, type PortableTextBlockComponent, type PortableTextComponents } from '@portabletext/to-html'

import type {
  CodeBlock,
  FootnoteDefinitionBlock,
  ImageBlock,
  MathBlock,
  MusicPlayerBlock,
  PortableTextBlock,
  PortableTextBody as PortableTextBodyType,
  SolutionBlock,
  TableBlock,
  TextBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'

import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { deriveSlug } from '@/server/infra/slug'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { collectHeadingSlotsInPortableTextRenderOrder, visitNestedBlocks } from '@/shared/pt/utils'
import { sanitizeUrl } from '@/shared/sanitize-url'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { escapeHtml } from '@/shared/utils/security'
import { joinUrl } from '@/shared/utils/urls'

export interface RenderPortableTextToHtmlOptions {
  rssMode?: boolean
  musicAutoplay?: 'suppressed' | 'default'
}

export async function renderPortableTextToHtml(
  db: NodePgDatabase,
  body: PortableTextBodyType,
  headingSlugs: readonly string[],
  options: RenderPortableTextToHtmlOptions = {},
): Promise<string> {
  const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))

  const headingIdByBlockKey = buildHeadingIdMap(body, headingSlugs)
  const isRss = options.rssMode === true

  const inlineBody = body.filter((block) => block._type !== 'footnoteDefinition')
  const footnotes = body.filter((block): block is FootnoteDefinitionBlock => block._type === 'footnoteDefinition')

  const musicByPlayerId = await resolveMusicPlayerMeta(db, body)

  const components = buildPortableTextComponents({ headingIdByBlockKey, isRss, musicByPlayerId })

  let html = toHTML(inlineBody as PortableTextBlock[], { components })

  if (footnotes.length > 0) {
    html += renderFootnotesSection(footnotes, footnotesSectionTitle, components)
  }

  return html
}

// Heading ID map

function buildHeadingIdMap(body: PortableTextBodyType, headingSlugs: readonly string[]): Map<string, string> {
  const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
  const map = new Map<string, string>()
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]
    const pre = headingSlugs[i]
    const id = typeof pre === 'string' && pre.length > 0 ? pre : deriveSlug(slot.plainText)
    map.set(slot.blockKey, id)
  }
  return map
}

// Music player resolution

interface MusicMeta {
  name: string
  artist: string
  audioUrl: string
  cover: string
}

async function resolveMusicPlayerMeta(db: NodePgDatabase, body: PortableTextBodyType): Promise<Map<string, MusicMeta>> {
  const playerIds = collectMusicPlayerIds(body)
  if (playerIds.length === 0) {
    return new Map()
  }

  const uniqueIds = [...new Set(playerIds)]
  const metas = await getPublicMusicMetasByIds(db, uniqueIds)

  const map = new Map<string, MusicMeta>()
  for (const [playerId, meta] of metas) {
    map.set(playerId, { name: meta.name, artist: meta.artist, audioUrl: meta.url, cover: absolutizeForFeed(meta.pic) })
  }
  return map
}

// Feed readers resolve URLs on a different origin, so a relative cover URL
// (the bundled default music cover) is joined with the site origin — the
// same way the feed generator absolutizes `/logo.svg`. Storage URLs already
// arrive absolute (`resolveAssetUrl` joins the CDN base or the site origin).
function absolutizeForFeed(url: string): string {
  if (!url.startsWith('/')) {
    return url
  }
  return joinUrl(requireBlogSettingsSection('siteIdentity').website, url)
}

function collectMusicPlayerIds(body: PortableTextBodyType): string[] {
  const ids: string[] = []
  visitNestedBlocks(body, (block) => {
    if (block._type === 'musicPlayer') {
      ids.push(block.playerId)
    }
  })
  return ids
}

// HTML components

interface ComponentContext {
  headingIdByBlockKey: Map<string, string>
  isRss: boolean
  musicByPlayerId: Map<string, MusicMeta>
}

// Mark → HTML rules shared by the block-level `marks` map and the
// table-cell inline renderer (`applyInlineMarkHtml`), so the two paths
// can never drift into divergent copies of the same rule.

interface LinkMarkValue {
  href?: string
  rel?: string
  target?: string
}

interface MathInlineMarkValue {
  tex?: string
  mathml?: string
  svg?: string
}

interface FootnoteRefMarkValue {
  index?: number
}

function renderLinkMark(children: string, value: LinkMarkValue): string {
  const href = sanitizeUrl(value.href ?? '')
  const rel = value.rel ? ` rel="${escapeHtml(value.rel)}"` : ''
  const target = value.target ? ` target="${escapeHtml(value.target)}"` : ''
  return `<a href="${escapeHtml(href)}"${rel}${target}>${children}</a>`
}

function renderMathInlineMark(children: string, value: MathInlineMarkValue | undefined, isRss: boolean): string {
  // Feed readers cannot safely consume raw MathML/SVG (active elements,
  // event attributes, external references), so RSS mode falls back to
  // plain TeX inside <code>. The web path prefers SVG for consistency.
  if (isRss) {
    return `<code>${value?.tex ? escapeHtml(value.tex) : children}</code>`
  }
  if (value?.svg !== undefined && value.svg !== '') {
    return value.svg
  }
  if (value?.mathml !== undefined && value.mathml !== '') {
    return value.mathml
  }
  return `<code>${value?.tex ? escapeHtml(value.tex) : children}</code>`
}

function renderFootnoteRefMark(children: string, value: FootnoteRefMarkValue | undefined): string {
  if (value === undefined) {
    return children
  }
  return `<sup><a href="#user-content-fn-${value.index}">${value.index}</a></sup>`
}

// h1–h4 share one renderer body; only the tag differs.
function makeHeadingBlock(ctx: ComponentContext, tag: 'h1' | 'h2' | 'h3' | 'h4'): PortableTextBlockComponent {
  return ({ children, value }) => {
    const id = ctx.headingIdByBlockKey.get((value as TextBlock)._key) ?? ''
    return `<${tag} id="${escapeHtml(id)}">${children}</${tag}>`
  }
}

function buildPortableTextComponents(ctx: ComponentContext): PortableTextComponents {
  return {
    block: {
      h1: makeHeadingBlock(ctx, 'h1'),
      h2: makeHeadingBlock(ctx, 'h2'),
      h3: makeHeadingBlock(ctx, 'h3'),
      h4: makeHeadingBlock(ctx, 'h4'),
      normal: ({ children }) => `<p>${children}</p>`,
      blockquote: ({ children }) => `<blockquote>${children}</blockquote>`,
    },
    list: {
      bullet: ({ children }) => `<ul>${children}</ul>`,
      number: ({ children }) => `<ol>${children}</ol>`,
    },
    listItem: {
      bullet: ({ children }) => `<li>${children}</li>`,
      number: ({ children }) => `<li>${children}</li>`,
    },
    marks: {
      strong: ({ children }) => `<strong>${children}</strong>`,
      em: ({ children }) => `<em>${children}</em>`,
      underline: ({ children }) => `<u>${children}</u>`,
      'strike-through': ({ children }) => `<s>${children}</s>`,
      code: ({ children }) => `<code>${children}</code>`,
      link: ({ value, children }) => (value === undefined ? children : renderLinkMark(children, value)),
      mathInline: ({ value, children }) => renderMathInlineMark(children, value, ctx.isRss),
      footnoteRef: ({ value, children }) => renderFootnoteRefMark(children, value),
    },
    types: {
      image: ({ value }) => renderImageBlock(value as ImageBlock),
      code: ({ value }) => renderCodeBlock(value as CodeBlock, ctx.isRss),
      mathBlock: ({ value }) => renderMathBlock(value as MathBlock, ctx.isRss),
      horizontalRule: () => '<hr />',
      musicPlayer: ({ value }) => renderMusicPlayer(value as MusicPlayerBlock, ctx),
      solution: ({ value }) => {
        const children = (value as SolutionBlock).children
        return toHTML(children as PortableTextBlock[], { components: buildPortableTextComponents(ctx) })
      },
      twoColumn: ({ value }) => {
        const v = value as TwoColumnBlock
        const left = toHTML(v.left as PortableTextBlock[], { components: buildPortableTextComponents(ctx) })
        const right = toHTML(v.right as PortableTextBlock[], { components: buildPortableTextComponents(ctx) })
        if (ctx.isRss) {
          return left + right
        }
        return `<div>${left}${right}</div>`
      },
      table: ({ value }) => renderTableBlock(value as TableBlock, ctx.isRss),
    },
    hardBreak: () => '<br />',
    unknownType: () => '',
    unknownMark: ({ children }) => children,
    unknownBlockStyle: ({ children }) => `<p>${children}</p>`,
    unknownList: ({ children }) => `<ul>${children}</ul>`,
    unknownListItem: ({ children }) => `<li>${children}</li>`,
  }
}

// Block renderers

function renderImageBlock(value: ImageBlock): string {
  const src = escapeHtml(value.src)
  const alt = value.alt !== undefined && value.alt !== '' ? ` alt="${escapeHtml(value.alt)}"` : ''
  const width = value.width !== undefined ? ` width="${value.width}"` : ''
  const height = value.height !== undefined ? ` height="${value.height}"` : ''
  const caption =
    value.caption !== undefined && value.caption !== '' ? `<figcaption>${escapeHtml(value.caption)}</figcaption>` : ''
  return `<figure><img src="${src}"${alt}${width}${height} />${caption}</figure>`
}

function renderCodeBlock(value: CodeBlock, isRss: boolean): string {
  const langClass =
    value.language !== undefined && value.language !== '' ? ` class="language-${escapeHtml(value.language)}"` : ''
  const dataLang =
    value.language !== undefined && value.language !== '' ? ` data-language="${escapeHtml(value.language)}"` : ''
  if (value.highlightedHtml !== undefined && value.highlightedHtml !== '') {
    const inner = isRss ? `<![CDATA[${value.highlightedHtml}]]>` : value.highlightedHtml
    return `<pre><code${langClass}${dataLang}>${inner}</code></pre>`
  }
  return `<pre><code${langClass}${dataLang}>${escapeHtml(value.code)}</code></pre>`
}

function renderMathBlock(value: MathBlock, isRss: boolean): string {
  if (isRss) {
    return `<pre><code>${escapeHtml(value.tex)}</code></pre>`
  }
  if (value.svg !== undefined && value.svg !== '') {
    return value.svg
  }
  if (value.mathml !== undefined && value.mathml !== '') {
    return value.mathml
  }
  return `<pre><code>${escapeHtml(value.tex)}</code></pre>`
}

function renderMusicPlayer(value: MusicPlayerBlock, ctx: ComponentContext): string {
  const meta = ctx.musicByPlayerId.get(value.playerId)
  if (meta === undefined) {
    return `<p>🎵 此文章包含音乐播放器，请访问原文收听。</p>`
  }
  const name = escapeHtml(meta.name)
  const artist = escapeHtml(meta.artist)
  const src = escapeHtml(meta.audioUrl)
  const cover = escapeHtml(meta.cover)
  return `<figure><img src="${cover}" alt="${name}" /><audio controls preload="none" src="${src}"></audio><figcaption>🎵 ${name} — ${artist}</figcaption></figure>`
}

// Table block

function renderTableBlock(value: TableBlock, isRss: boolean): string {
  const rows = value.rows ?? []
  const hasHeader = value.hasHeaderRow ?? false
  const headRows = hasHeader ? rows.slice(0, 1) : []
  const bodyRows = hasHeader ? rows.slice(1) : rows

  let html = '<table>'
  if (headRows.length > 0) {
    html += '<thead>'
    for (const row of headRows) {
      html += '<tr>'
      for (const cell of row.cells) {
        html += `<th>${renderSpansInline(cell.content, cell.markDefs ?? [], isRss)}</th>`
      }
      html += '</tr>'
    }
    html += '</thead>'
  }
  html += '<tbody>'
  for (const row of bodyRows) {
    html += '<tr>'
    for (const cell of row.cells) {
      const tag = cell.isHeader === true ? 'th' : 'td'
      html += `<${tag}>${renderSpansInline(cell.content, cell.markDefs ?? [], isRss)}</${tag}>`
    }
    html += '</tr>'
  }
  html += '</tbody></table>'
  return html
}

function renderSpansInline(
  spans: readonly { _key: string; text: string; marks?: string[] }[],
  markDefs: readonly {
    _key: string
    _type: string
    href?: string
    rel?: string
    target?: string
    tex?: string
    mathml?: string
    svg?: string
    index?: number
  }[],
  isRss: boolean,
): string {
  return spans.map((span) => renderSpanInline(span, markDefs, isRss)).join('')
}

function renderSpanInline(
  span: { _key: string; text: string; marks?: string[] },
  markDefs: readonly {
    _key: string
    _type: string
    href?: string
    rel?: string
    target?: string
    tex?: string
    mathml?: string
    svg?: string
    index?: number
  }[],
  isRss: boolean,
): string {
  const marks = span.marks ?? []
  if (marks.length === 0) {
    return escapeHtml(span.text)
  }
  let html = escapeHtml(span.text)
  for (const markName of marks) {
    html = applyInlineMarkHtml(html, markName, markDefs, isRss)
  }
  return html
}

function applyInlineMarkHtml(
  text: string,
  markName: string,
  markDefs: readonly {
    _key: string
    _type: string
    href?: string
    rel?: string
    target?: string
    tex?: string
    mathml?: string
    svg?: string
    index?: number
  }[],
  isRss: boolean,
): string {
  switch (markName) {
    case 'strong':
      return `<strong>${text}</strong>`
    case 'em':
      return `<em>${text}</em>`
    case 'underline':
      return `<u>${text}</u>`
    case 'strike-through':
      return `<s>${text}</s>`
    case 'code':
      return `<code>${text}</code>`
  }
  const def = markDefs.find((entry) => entry._key === markName)
  if (def === undefined) {
    return text
  }
  // Same mark rules as the block-level `marks` map — see the shared
  // helpers at the top of this file.
  switch (def._type) {
    case 'link':
      return renderLinkMark(text, def)
    case 'mathInline':
      return renderMathInlineMark(text, def, isRss)
    case 'footnoteRef':
      return renderFootnoteRefMark(text, def)
  }
  return text
}

// Footnotes section

function renderFootnotesSection(
  definitions: readonly FootnoteDefinitionBlock[],
  sectionTitle: string,
  components: PortableTextComponents,
): string {
  let html = `<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">`
  html += `<h3 id="footnotes-section-heading">${escapeHtml(sectionTitle)}</h3>`
  html += '<ol>'
  for (const def of definitions) {
    const anchorId = `user-content-fn-${def.index}`
    const childrenHtml = toHTML(def.children as PortableTextBlock[], { components })
    html += `<li id="${anchorId}">${childrenHtml}<p><a href="#user-content-fnref-${def.index}" data-footnote-backref="" aria-label="返回引用">↩</a></p></li>`
  }
  html += '</ol></section>'
  return html
}
