/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/no-unsafe-type-assertion */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { toHTML, type PortableTextComponents } from '@portabletext/to-html'

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

import { findMusicByPlayerIds } from '@/server/domains/music/services/read'
import { safeBuildMusicPublicUrl } from '@/server/domains/music/storage'
import { deriveSlug } from '@/server/infra/slug'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { collectHeadingSlotsInPortableTextRenderOrder } from '@/shared/pt/utils'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { escapeHtml } from '@/shared/utils/security'

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
}

async function resolveMusicPlayerMeta(db: NodePgDatabase, body: PortableTextBodyType): Promise<Map<string, MusicMeta>> {
  const playerIds = collectMusicPlayerIds(body)
  if (playerIds.length === 0) {
    return new Map()
  }

  const uniqueIds = [...new Set(playerIds)]
  const rows = await findMusicByPlayerIds(db, uniqueIds)

  const map = new Map<string, MusicMeta>()
  for (const row of rows) {
    const audioUrl = safeBuildMusicPublicUrl(row.audioStoragePath, row.storageDriver)
    if (audioUrl !== null) {
      map.set(row.playerId, { name: row.name, artist: row.artist, audioUrl })
    }
  }
  return map
}

function collectMusicPlayerIds(body: PortableTextBodyType): string[] {
  const ids: string[] = []
  for (const block of body) {
    if (block._type === 'musicPlayer') {
      ids.push(block.playerId)
      continue
    }
    if (block._type === 'solution' || block._type === 'footnoteDefinition') {
      for (const child of block.children) {
        if (child._type === 'musicPlayer') {
          ids.push(child.playerId)
        }
      }
      continue
    }
    if (block._type === 'twoColumn') {
      for (const child of block.left) {
        if (child._type === 'musicPlayer') {
          ids.push(child.playerId)
        }
      }
      for (const child of block.right) {
        if (child._type === 'musicPlayer') {
          ids.push(child.playerId)
        }
      }
      continue
    }
  }
  return ids
}

// HTML components

interface ComponentContext {
  headingIdByBlockKey: Map<string, string>
  isRss: boolean
  musicByPlayerId: Map<string, MusicMeta>
}

function buildPortableTextComponents(ctx: ComponentContext): PortableTextComponents {
  return {
    block: {
      h1: ({ children, value }) => {
        const id = ctx.headingIdByBlockKey.get((value as TextBlock)._key) ?? ''
        return `<h1 id="${escapeHtml(id)}">${children}</h1>`
      },
      h2: ({ children, value }) => {
        const id = ctx.headingIdByBlockKey.get((value as TextBlock)._key) ?? ''
        return `<h2 id="${escapeHtml(id)}">${children}</h2>`
      },
      h3: ({ children, value }) => {
        const id = ctx.headingIdByBlockKey.get((value as TextBlock)._key) ?? ''
        return `<h3 id="${escapeHtml(id)}">${children}</h3>`
      },
      h4: ({ children, value }) => {
        const id = ctx.headingIdByBlockKey.get((value as TextBlock)._key) ?? ''
        return `<h4 id="${escapeHtml(id)}">${children}</h4>`
      },
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
      link: ({ value, children }) => {
        if (value === undefined) {
          return children
        }
        const href = /^\s*(javascript|data):/i.test(value.href) ? '#' : value.href
        const rel = value.rel ? ` rel="${escapeHtml(value.rel)}"` : ''
        const target = value.target ? ` target="${escapeHtml(value.target)}"` : ''
        return `<a href="${escapeHtml(href)}"${rel}${target}>${children}</a>`
      },
      mathInline: ({ value, children }) => {
        if (ctx.isRss) {
          return `<code>${value?.tex ? escapeHtml(value.tex) : children}</code>`
        }
        if (value?.svg !== undefined && value.svg !== '') {
          return value.svg
        }
        if (value?.mathml !== undefined && value.mathml !== '') {
          return value.mathml
        }
        return `<code>${value?.tex ? escapeHtml(value.tex) : children}</code>`
      },
      footnoteRef: ({ value, children }) => {
        if (value === undefined) {
          return children
        }
        return `<sup><a href="#user-content-fn-${value.index}">${value.index}</a></sup>`
      },
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
  return `<figure><audio controls preload="none" src="${src}"></audio><figcaption>🎵 ${name} — ${artist}</figcaption></figure>`
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
  switch (def._type) {
    case 'link': {
      const href = /^\s*(javascript|data):/i.test(def.href ?? '') ? '#' : (def.href ?? '#')
      const rel = def.rel ? ` rel="${escapeHtml(def.rel)}"` : ''
      const target = def.target ? ` target="${escapeHtml(def.target)}"` : ''
      return `<a href="${escapeHtml(href)}"${rel}${target}>${text}</a>`
    }
    case 'mathInline': {
      // Feed readers cannot safely consume raw MathML/SVG (active elements,
      // event attributes, external references), so RSS mode falls back to
      // plain TeX inside <code>. The web path prefers SVG for consistency.
      if (isRss) {
        return `<code>${def.tex ? escapeHtml(def.tex) : text}</code>`
      }
      if (def.svg !== undefined && def.svg !== '') {
        return def.svg
      }
      if (def.mathml !== undefined && def.mathml !== '') {
        return def.mathml
      }
      return `<code>${def.tex ? escapeHtml(def.tex) : text}</code>`
    }
    case 'footnoteRef':
      return `<sup><a href="#user-content-fn-${def.index}">${def.index}</a></sup>`
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
