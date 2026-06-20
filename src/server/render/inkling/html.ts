import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type {
  InklingBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingInlineNode,
  InklingTableCellNode,
  InklingTableNode,
} from '@/shared/inkling/schema'

import { findMusicByPlayerIds } from '@/server/domains/music/services/read'
import { safeBuildMusicPublicUrl } from '@/server/domains/music/storage'
import { deriveSlug } from '@/server/infra/slug'
import { sanitizeMathml, sanitizeShikiHtml } from '@/server/render/inkling/sanitize'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'
import { collectInklingHeadingSlots } from '@/shared/inkling/headings'
import { walkInkling, type InklingWalkerHandlers } from '@/shared/inkling/walk'
import { sanitizeUrl } from '@/shared/sanitize-url'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { escapeHtml } from '@/shared/utils/security'

export interface RenderInklingToHtmlOptions {
  rssMode?: boolean
  musicAutoplay?: 'suppressed' | 'default'
}

interface MusicMeta {
  name: string
  artist: string
  audioUrl: string
}

interface HtmlRenderCtx {
  stack: string[][]
  isRss: boolean
  headingIdByBlockKey: Map<string, string>
  musicByPlayerId: Map<string, MusicMeta>
}

export async function renderInklingToHtml(
  db: NodePgDatabase,
  document: InklingDocument,
  headingSlugs: readonly string[],
  options: RenderInklingToHtmlOptions = {},
): Promise<string> {
  const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))
  const headingIdByBlockKey = buildHeadingIdMap(document, headingSlugs)
  const isRss = options.rssMode === true
  const musicByPlayerId = await resolveMusicPlayerMeta(db, document)

  const inlineBody = document.root.children.filter((node) => node.type !== 'footnote-definition')
  const footnotes = document.root.children.filter(
    (node): node is InklingFootnoteDefinitionNode => node.type === 'footnote-definition',
  )

  const ctx: HtmlRenderCtx = {
    stack: [[]],
    isRss,
    headingIdByBlockKey,
    musicByPlayerId,
  }
  const handlers = buildHtmlHandlers(ctx)

  for (const node of inlineBody) {
    walkSingleBlock(node, handlers, ctx)
  }

  let html = ctx.stack[0]!.join('')

  if (footnotes.length > 0) {
    html += renderFootnotesSection(footnotes, footnotesSectionTitle, ctx)
  }

  return html
}

function buildHeadingIdMap(document: InklingDocument, headingSlugs: readonly string[]): Map<string, string> {
  const slots = collectInklingHeadingSlots(document)
  const map = new Map<string, string>()
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const pre = headingSlugs[i]
    const id = typeof pre === 'string' && pre.length > 0 ? pre : deriveSlug(slot.plainText)
    map.set(slot.blockKey, id)
  }
  return map
}

async function resolveMusicPlayerMeta(db: NodePgDatabase, document: InklingDocument): Promise<Map<string, MusicMeta>> {
  const playerIds = collectMusicPlayerIds(document)
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

function collectMusicPlayerIds(document: InklingDocument): string[] {
  const ids: string[] = []
  walkInkling(
    document,
    {
      music: (node) => {
        ids.push(node.playerId)
      },
    },
    undefined,
  )
  return ids
}

function enter(ctx: HtmlRenderCtx): void {
  ctx.stack.push([])
}

function leave(ctx: HtmlRenderCtx): string[] {
  return ctx.stack.pop() ?? []
}

function append(ctx: HtmlRenderCtx, html: string): void {
  ctx.stack[ctx.stack.length - 1]!.push(html)
}

function makeSingleBlockDocument(node: InklingBlockNode): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [node],
    },
  }
}

function walkSingleBlock<T>(node: InklingBlockNode, handlers: InklingWalkerHandlers<T>, ctx: T): void {
  walkInkling(makeSingleBlockDocument(node), handlers, ctx)
}

function renderInlineNodeHtml(node: InklingInlineNode, ctx: HtmlRenderCtx): string {
  switch (node.type) {
    case 'text':
      return renderFormattedText(node.text, node.format ?? 0)
    case 'linebreak':
      return '<br />'
    case 'inline-math': {
      if (ctx.isRss) {
        return `<code>${escapeHtml(node.tex)}</code>`
      }
      if (node.mathml !== undefined && node.mathml !== '') {
        return sanitizeMathml(node.mathml)
      }
      return `<code>${escapeHtml(node.tex)}</code>`
    }
    case 'footnote-ref':
      return `<sup id="user-content-fnref-${node.index}"><a href="#user-content-fn-${node.index}">${node.index}</a></sup>`
    case 'link': {
      const children = node.children.map((child) => renderInlineNodeHtml(child, ctx)).join('')
      const href = sanitizeUrl(node.url)
      const rel = node.rel ? ` rel="${escapeHtml(node.rel)}"` : ''
      const target = node.target ? ` target="${escapeHtml(node.target)}"` : ''
      return `<a href="${escapeHtml(href)}"${rel}${target}>${children}</a>`
    }
  }
}

function renderInlineNodesHtml(nodes: readonly InklingInlineNode[], ctx: HtmlRenderCtx): string {
  return nodes.map((node) => renderInlineNodeHtml(node, ctx)).join('')
}

// Lexical text format bits, imported from the shared source of truth so they
// stay in sync with lexical's IS_* constants.
const FORMAT_BOLD = INKLING_FORMAT_BOLD
const FORMAT_ITALIC = INKLING_FORMAT_ITALIC
const FORMAT_UNDERLINE = INKLING_FORMAT_UNDERLINE
const FORMAT_CODE = INKLING_FORMAT_CODE
const FORMAT_STRIKETHROUGH = INKLING_FORMAT_STRIKETHROUGH

function renderFormattedText(text: string, format: number): string {
  let html = escapeHtml(text).replace(/\n/g, '<br />')
  if ((format & FORMAT_BOLD) !== 0) {
    html = `<strong>${html}</strong>`
  }
  if ((format & FORMAT_ITALIC) !== 0) {
    html = `<em>${html}</em>`
  }
  if ((format & FORMAT_UNDERLINE) !== 0) {
    html = `<u>${html}</u>`
  }
  if ((format & FORMAT_STRIKETHROUGH) !== 0) {
    html = `<s>${html}</s>`
  }
  if ((format & FORMAT_CODE) !== 0) {
    html = `<code>${html}</code>`
  }
  return html
}

function renderTableHtml(node: InklingTableNode, ctx: HtmlRenderCtx): string {
  const rows = node.rows
  const hasHeader = rows.length > 0 && rows[0]!.cells.some((cell) => cell.isHeader === true)
  const headRows = hasHeader ? rows.slice(0, 1) : []
  const bodyRows = hasHeader ? rows.slice(1) : rows

  let html = '<table>'
  if (headRows.length > 0) {
    html += '<thead>'
    for (const row of headRows) {
      html += '<tr>'
      for (const cell of row.cells) {
        html += `<th>${renderTableCellHtml(cell, ctx)}</th>`
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
      html += `<${tag}>${renderTableCellHtml(cell, ctx)}</${tag}>`
    }
    html += '</tr>'
  }
  html += '</tbody></table>'
  return html
}

function renderTableCellHtml(cell: InklingTableCellNode, ctx: HtmlRenderCtx): string {
  return renderInlineNodesHtml(cell.children, ctx)
}

function renderImageBlockHtml(node: {
  src: string
  alt?: string
  caption?: string
  width?: number
  height?: number
}): string {
  const src = escapeHtml(sanitizeUrl(node.src))
  const alt = node.alt !== undefined && node.alt !== '' ? ` alt="${escapeHtml(node.alt)}"` : ''
  const width = node.width !== undefined ? ` width="${node.width}"` : ''
  const height = node.height !== undefined ? ` height="${node.height}"` : ''
  const caption =
    node.caption !== undefined && node.caption !== '' ? `<figcaption>${escapeHtml(node.caption)}</figcaption>` : ''
  return `<figure><img src="${src}"${alt}${width}${height} />${caption}</figure>`
}

function renderCodeBlockHtml(
  node: { code: string; language?: string; highlightedHtml?: string },
  isRss: boolean,
): string {
  const langClass =
    node.language !== undefined && node.language !== '' ? ` class="language-${escapeHtml(node.language)}"` : ''
  const dataLang =
    node.language !== undefined && node.language !== '' ? ` data-language="${escapeHtml(node.language)}"` : ''
  if (node.highlightedHtml !== undefined && node.highlightedHtml !== '') {
    const inner = isRss
      ? `<![CDATA[${sanitizeShikiHtml(node.highlightedHtml)}]]>`
      : sanitizeShikiHtml(node.highlightedHtml)
    return `<pre><code${langClass}${dataLang}>${inner}</code></pre>`
  }
  return `<pre><code${langClass}${dataLang}>${escapeHtml(node.code)}</code></pre>`
}

function renderMathBlockHtml(node: { tex: string; mathml?: string }, isRss: boolean): string {
  if (isRss) {
    return `<pre><code>${escapeHtml(node.tex)}</code></pre>`
  }
  if (node.mathml !== undefined && node.mathml !== '') {
    return sanitizeMathml(node.mathml)
  }
  return `<pre><code>${escapeHtml(node.tex)}</code></pre>`
}

function renderMusicPlayerHtml(node: { playerId: string }, ctx: HtmlRenderCtx): string {
  const meta = ctx.musicByPlayerId.get(node.playerId)
  if (meta === undefined) {
    return `<p>🎵 此文章包含音乐播放器，请访问原文收听。</p>`
  }
  const name = escapeHtml(meta.name)
  const artist = escapeHtml(meta.artist)
  const src = escapeHtml(meta.audioUrl)
  return `<figure><audio controls preload="none" src="${src}"></audio><figcaption>🎵 ${name} — ${artist}</figcaption></figure>`
}

function buildHtmlHandlers(ctx: HtmlRenderCtx): InklingWalkerHandlers<HtmlRenderCtx> {
  return {
    paragraph: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c).join('')
      append(c, `<p>${children}</p>`)
    },
    heading: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c).join('')
      const id = ctx.headingIdByBlockKey.get(node.key ?? '') ?? ''
      append(c, `<${node.tag} id="${escapeHtml(id)}">${children}</${node.tag}>`)
    },
    quote: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c).join('')
      append(c, `<blockquote>${children}</blockquote>`)
    },
    list: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c).join('')
      const tag = node.listType === 'bullet' ? 'ul' : 'ol'
      append(c, `<${tag}>${children}</${tag}>`)
    },
    listitem: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c).join('')
      append(c, `<li>${children}</li>`)
    },
    text: (node, c) => {
      append(c, renderFormattedText(node.text, node.format ?? 0))
    },
    linebreak: (_node, c) => {
      append(c, '<br />')
    },
    link: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c).join('')
      const href = sanitizeUrl(node.url)
      const rel = node.rel ? ` rel="${escapeHtml(node.rel)}"` : ''
      const target = node.target ? ` target="${escapeHtml(node.target)}"` : ''
      append(c, `<a href="${escapeHtml(href)}"${rel}${target}>${children}</a>`)
    },
    inlineMath: (node, c) => {
      if (c.isRss) {
        append(c, `<code>${escapeHtml(node.tex)}</code>`)
      } else if (node.mathml !== undefined && node.mathml !== '') {
        append(c, sanitizeMathml(node.mathml))
      } else {
        append(c, `<code>${escapeHtml(node.tex)}</code>`)
      }
    },
    footnoteRef: (node, c) => {
      append(
        c,
        `<sup id="user-content-fnref-${node.index}"><a href="#user-content-fn-${node.index}">${node.index}</a></sup>`,
      )
    },
    image: (node, c) => {
      append(c, renderImageBlockHtml(node))
    },
    code: (node, c) => {
      append(c, renderCodeBlockHtml(node, c.isRss))
    },
    mathBlock: (node, c) => {
      append(c, renderMathBlockHtml(node, c.isRss))
    },
    music: (node, c) => {
      append(c, renderMusicPlayerHtml(node, c))
    },
    horizontalRule: (_node, c) => {
      append(c, '<hr />')
    },
    table: (node, c) => {
      append(c, renderTableHtml(node, c))
    },
    solution: (node, c) => {
      let html = ''
      for (const child of node.children) {
        const childCtx: HtmlRenderCtx = {
          stack: [[]],
          isRss: c.isRss,
          headingIdByBlockKey: c.headingIdByBlockKey,
          musicByPlayerId: c.musicByPlayerId,
        }
        walkSingleBlock(child, buildHtmlHandlers(childCtx), childCtx)
        html += childCtx.stack[0]!.join('')
      }
      append(c, html)
    },
    twoColumn: (node, c) => {
      let left = ''
      let right = ''
      for (const child of node.left) {
        const childCtx: HtmlRenderCtx = {
          stack: [[]],
          isRss: c.isRss,
          headingIdByBlockKey: c.headingIdByBlockKey,
          musicByPlayerId: c.musicByPlayerId,
        }
        walkSingleBlock(child, buildHtmlHandlers(childCtx), childCtx)
        left += childCtx.stack[0]!.join('')
      }
      for (const child of node.right) {
        const childCtx: HtmlRenderCtx = {
          stack: [[]],
          isRss: c.isRss,
          headingIdByBlockKey: c.headingIdByBlockKey,
          musicByPlayerId: c.musicByPlayerId,
        }
        walkSingleBlock(child, buildHtmlHandlers(childCtx), childCtx)
        right += childCtx.stack[0]!.join('')
      }
      if (c.isRss) {
        append(c, left + right)
      } else {
        append(c, `<div>${left}${right}</div>`)
      }
    },
  }
}

function renderFootnoteDefinitionChildrenHtml(node: InklingFootnoteDefinitionNode, ctx: HtmlRenderCtx): string {
  return node.children
    .map((child) => {
      const childCtx: HtmlRenderCtx = {
        stack: [[]],
        isRss: ctx.isRss,
        headingIdByBlockKey: ctx.headingIdByBlockKey,
        musicByPlayerId: ctx.musicByPlayerId,
      }
      walkSingleBlock(child, buildHtmlHandlers(childCtx), childCtx)
      return childCtx.stack[0]!.join('')
    })
    .join('')
}

function renderFootnotesSection(
  definitions: readonly InklingFootnoteDefinitionNode[],
  sectionTitle: string,
  ctx: HtmlRenderCtx,
): string {
  let html = `<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">`
  html += `<h3 id="footnotes-section-heading">${escapeHtml(sectionTitle)}</h3>`
  html += '<ol>'
  for (const def of definitions) {
    const anchorId = `user-content-fn-${def.index}`
    const childrenHtml = renderFootnoteDefinitionChildrenHtml(def, ctx)
    html += `<li id="${anchorId}">${childrenHtml}<p><a href="#user-content-fnref-${def.index}" data-footnote-backref="" aria-label="返回引用">↩</a></p></li>`
  }
  html += '</ol></section>'
  return html
}
