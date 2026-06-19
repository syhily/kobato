#!/usr/bin/env node
//
// Read-only verifier: every local comment.body converts to schema-valid,
// residual-tag-free Inkling JSON. For the ~94 historically-affected comments
// it records structural deltas (no raw text) and regenerates the markdown
// snapshot to prove visible HTML residue is gone.
//
//   pnpm exec vite-node scripts/inkling-poc/verify-comment-html-cleanup.ts
//

import { mkdir, writeFile } from 'node:fs/promises'
import { Client } from 'pg'

import type { InklingDocument, InklingInlineNode, InklingListNode, InklingTextNode } from '@/shared/inkling/schema'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { PortableTextBody } from '@/shared/pt/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { commentPortableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { inklingToPlainText } from '@/shared/inkling/plaintext'
import { walkInkling } from '@/shared/inkling/walk'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { bodyToPlainText } from '@/shared/pt/utils'

const DATABASE_URL = process.env.DATABASE_URL

const TAG_RE = /(<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\/?>)/g
const A_OPEN_RE = /<a\b[^>]*?>/gi
const A_CLOSE_RE = /<\/a\s*>/gi
const IMG_RE = /<img\b[^>]*?\/?>/gi
const BR_RE = /<br\b[^>]*?\/?>/gi
const P_RE = /<\/?p\b[^>]*?>/gi
const IMG_WITH_ALT_RE = /<img\b[^>]*?\salt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
const RESIDUAL_TEXT_RE = /<\/?[a-zA-Z]/
const MARKDOWN_RESIDUAL_RE = /<p>|<a|<br/i

const ORPHAN_TOLERANCE = 20

interface CommentDelta {
  id: number
  tagTypes: string[]
  aOpen: number
  aClose: number
  img: number
  imgWithAlt: number
  br: number
  p: number
  producedLink: boolean
  producedLinebreak: boolean
  producedParagraphSplit: boolean
  producedDecorator: boolean
  producedImageAltText: boolean
  plaintextBefore: number
  plaintextAfter: number
}

interface Report {
  generatedAt: string
  totalComments: number
  affectedComments: number
  cleanedComments: number
  residualTagComments: number
  contentLossComments: number
  validationFailures: number
  totalLinkNodesProduced: number
  totalLinebreakNodesProduced: number
  totalParagraphSplitsProduced: number
  totalAOpen: number
  totalAClose: number
  totalImg: number
  totalBr: number
  deltas: CommentDelta[]
}

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_UNDERLINE = 4
const FORMAT_CODE = 8
const FORMAT_STRIKETHROUGH = 16

function hasDecorator(format: number | undefined): boolean {
  if (format === undefined) {
    return false
  }
  return (format & (FORMAT_BOLD | FORMAT_ITALIC | FORMAT_UNDERLINE | FORMAT_CODE | FORMAT_STRIKETHROUGH)) !== 0
}

function residualTagInTextNode(node: InklingTextNode): boolean {
  return RESIDUAL_TEXT_RE.test(node.text)
}

function collectStructuralCounts(document: InklingDocument) {
  let link = 0
  let linebreak = 0
  let decorator = false

  walkInkling(
    document,
    {
      link: (node, _ctx, walkChildren) => {
        link += 1
        walkChildren()
      },
      linebreak: () => {
        linebreak += 1
      },
      text: (node) => {
        if (hasDecorator(node.format)) {
          decorator = true
        }
      },
    },
    undefined,
  )

  return { link, linebreak, decorator }
}

function escapeInline(text: string): string {
  return text.replace(/([\\`*_])/g, '\\$1')
}

function renderInlineNode(node: InklingInlineNode): string {
  switch (node.type) {
    case 'text': {
      let text = escapeInline(node.text)
      const format = node.format ?? 0
      if ((format & FORMAT_CODE) !== 0) {
        return `\`${node.text}\``
      }
      if ((format & FORMAT_STRIKETHROUGH) !== 0) {
        text = `~~${text}~~`
      }
      if ((format & FORMAT_ITALIC) !== 0) {
        text = `*${text}*`
      }
      if ((format & FORMAT_BOLD) !== 0) {
        text = `**${text}**`
      }
      if ((format & FORMAT_UNDERLINE) !== 0) {
        text = `<u>${text}</u>`
      }
      return text
    }
    case 'linebreak':
      return '\n'
    case 'inline-math':
      return `$${node.tex}$`
    case 'link': {
      const inner = node.children.map(renderInlineNode).join('')
      const href = node.url.includes(')') ? `<${node.url}>` : node.url
      return `[${inner}](${href})`
    }
    default:
      return ''
  }
}

function renderBlockChildren(children: readonly InklingInlineNode[]): string {
  return children.map(renderInlineNode).join('')
}

function renderListItems(node: InklingListNode, indent: string): string[] {
  const lines: string[] = []
  for (const item of node.children) {
    const prefix = node.listType === 'number' ? '1.' : '-'
    const inlineParts: string[] = []
    for (const child of item.children) {
      if (child.type === 'list') {
        if (inlineParts.length > 0) {
          lines.push(`${indent}${prefix} ${inlineParts.join('')}`)
          inlineParts.length = 0
        }
        lines.push(...renderListItems(child, `${indent}  `))
      } else {
        inlineParts.push(renderInlineNode(child))
      }
    }
    if (inlineParts.length > 0) {
      lines.push(`${indent}${prefix} ${inlineParts.join('')}`)
    }
  }
  return lines
}

function inklingCommentDocumentToMarkdown(document: InklingDocument): string {
  const blocks: string[] = []
  for (const block of document.root.children) {
    switch (block.type) {
      case 'paragraph': {
        blocks.push(renderBlockChildren(block.children))
        break
      }
      case 'quote': {
        blocks.push(
          ...renderBlockChildren(block.children)
            .split('\n')
            .map((line) => `> ${line}`),
        )
        break
      }
      case 'list': {
        blocks.push(...renderListItems(block, ''))
        break
      }
      case 'code-block': {
        const fence = block.language ? `\`\`\`${block.language}` : '```'
        blocks.push([fence, block.code, '```'].join('\n'))
        break
      }
      case 'math-block': {
        blocks.push(`$$${block.tex}$$`)
        break
      }
    }
  }
  return blocks.join('\n\n').trim()
}

function detectTagTypes(text: string): string[] {
  const types = new Set<string>()
  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(text)) !== null) {
    const tag = m[2]
    if (tag !== undefined) {
      types.add(tag.toLowerCase())
    }
  }
  return [...types].sort()
}

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0
  let count = 0
  while (re.exec(text) !== null) {
    count += 1
  }
  return count
}

function countImageWithAlt(text: string): number {
  IMG_WITH_ALT_RE.lastIndex = 0
  let count = 0
  let m: RegExpExecArray | null
  while ((m = IMG_WITH_ALT_RE.exec(text)) !== null) {
    const alt = m[1] ?? m[2] ?? m[3] ?? ''
    if (alt.length > 0) {
      count += 1
    }
  }
  return count
}

function scanBodyForTags(body: CommentBody): {
  affected: boolean
  tagTypes: string[]
  aOpen: number
  aClose: number
  img: number
  imgWithAlt: number
  br: number
  p: number
} {
  let affected = false
  const allTypes = new Set<string>()
  let aOpen = 0
  let aClose = 0
  let img = 0
  let imgWithAlt = 0
  let br = 0
  let p = 0

  for (const block of body) {
    if (block._type !== 'block') {
      continue
    }
    for (const span of block.children) {
      const text = span.text
      const types = detectTagTypes(text)
      if (types.length > 0) {
        affected = true
        for (const t of types) {
          allTypes.add(t)
        }
        aOpen += countMatches(text, A_OPEN_RE)
        aClose += countMatches(text, A_CLOSE_RE)
        img += countMatches(text, IMG_RE)
        imgWithAlt += countImageWithAlt(text)
        br += countMatches(text, BR_RE)
        p += countMatches(text, P_RE)
      }
    }
  }

  return {
    affected,
    tagTypes: [...allTypes].sort(),
    aOpen,
    aClose,
    img,
    imgWithAlt,
    br,
    p,
  }
}

function validateNoResidualTags(document: InklingDocument): boolean {
  let clean = true
  walkInkling(
    document,
    {
      text: (node) => {
        if (residualTagInTextNode(node)) {
          clean = false
        }
      },
    },
    undefined,
  )
  return clean
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  try {
    await client.query('BEGIN')
    await client.query('SET TRANSACTION READ ONLY')
    const result = await client.query<{ id: bigint; body: unknown }>('SELECT id, body FROM comment ORDER BY id')
    await client.query('COMMIT')

    const report: Report = {
      generatedAt: new Date().toISOString(),
      totalComments: result.rows.length,
      affectedComments: 0,
      cleanedComments: 0,
      residualTagComments: 0,
      contentLossComments: 0,
      validationFailures: 0,
      totalLinkNodesProduced: 0,
      totalLinebreakNodesProduced: 0,
      totalParagraphSplitsProduced: 0,
      totalAOpen: 0,
      totalAClose: 0,
      totalImg: 0,
      totalBr: 0,
      deltas: [],
    }

    for (const row of result.rows) {
      const id = Number(row.id)
      let body: CommentBody
      try {
        body = commentBodySchema.parse(row.body)
      } catch (error) {
        console.error(`comment ${id}: invalid PT body: ${formatError(error)}`)
        report.validationFailures += 1
        continue
      }

      const scan = scanBodyForTags(body)
      const ptPlain = bodyToPlainText(body as unknown as PortableTextBody)

      let document: InklingDocument
      try {
        document = commentPortableTextToInklingDocument(body)
      } catch (error) {
        console.error(`comment ${id}: conversion failed: ${formatError(error)}`)
        report.validationFailures += 1
        if (scan.affected) {
          report.affectedComments += 1
        }
        continue
      }

      const modeValidation = validateInklingDocumentForMode(document, 'comment')
      if (!modeValidation.ok) {
        console.error(
          `comment ${id}: feature validation failed: ${modeValidation.forbiddenType} at ${modeValidation.path}`,
        )
        report.validationFailures += 1
        if (scan.affected) {
          report.affectedComments += 1
        }
        continue
      }

      const inklingPlain = inklingToPlainText(document)
      const residual = !validateNoResidualTags(document)
      const markdown = inklingCommentDocumentToMarkdown(document)
      const markdownResidual = MARKDOWN_RESIDUAL_RE.test(markdown)

      if (residual) {
        report.residualTagComments += 1
        console.error(`comment ${id}: residual tag-shaped text found after cleaning`)
      }

      if (scan.affected) {
        report.affectedComments += 1

        if (ptPlain.length > 0 && inklingPlain.length === 0) {
          report.contentLossComments += 1
          console.error(`comment ${id}: previously-non-empty comment became empty after cleaning`)
        }

        const originalTextBlocks = body.filter((b) => b._type === 'block').length
        const cleanedTextBlocks = document.root.children.filter(
          (b) => b.type === 'paragraph' || b.type === 'quote',
        ).length
        const producedParagraphSplit = cleanedTextBlocks > originalTextBlocks

        const counts = collectStructuralCounts(document)
        report.totalLinkNodesProduced += counts.link
        report.totalLinebreakNodesProduced += counts.linebreak
        report.totalParagraphSplitsProduced += producedParagraphSplit ? 1 : 0
        report.totalAOpen += scan.aOpen
        report.totalAClose += scan.aClose
        report.totalImg += scan.img
        report.totalBr += scan.br

        if (counts.link > 0 || counts.linebreak > 0 || producedParagraphSplit) {
          report.cleanedComments += 1
        }

        report.deltas.push({
          id,
          tagTypes: scan.tagTypes,
          aOpen: scan.aOpen,
          aClose: scan.aClose,
          img: scan.img,
          imgWithAlt: scan.imgWithAlt,
          br: scan.br,
          p: scan.p,
          producedLink: counts.link > 0,
          producedLinebreak: counts.linebreak > 0,
          producedParagraphSplit,
          producedDecorator: counts.decorator,
          producedImageAltText: scan.imgWithAlt > 0,
          plaintextBefore: ptPlain.length,
          plaintextAfter: inklingPlain.length,
        })
      }

      if (markdownResidual) {
        console.error(`comment ${id}: markdown snapshot still contains literal tag residue`)
        report.validationFailures += 1
      }
    }

    const maxPossibleLinks = Math.min(report.totalAOpen, report.totalAClose)
    const linkLowerBound = Math.max(0, maxPossibleLinks - ORPHAN_TOLERANCE)
    let countsOk = true
    if (report.totalLinkNodesProduced > maxPossibleLinks) {
      countsOk = false
      console.error(
        `link count divergence: produced ${report.totalLinkNodesProduced} but max possible is ${maxPossibleLinks}`,
      )
    }
    if (report.totalLinkNodesProduced < linkLowerBound) {
      countsOk = false
      console.error(
        `link count divergence: produced ${report.totalLinkNodesProduced} but lower bound (with orphan tolerance) is ${linkLowerBound}`,
      )
    }

    const outputPath = 'tmp/inkling-poc/comment-html-cleanup-report.json'
    await mkdir('tmp/inkling-poc', { recursive: true })
    await writeFile(outputPath, JSON.stringify(report, null, 2))

    console.log('=== comment.body HTML cleanup verifier ===')
    console.log(`total comments scanned:        ${report.totalComments}`)
    console.log(`affected comments:             ${report.affectedComments}`)
    console.log(`cleaned comments:              ${report.cleanedComments}`)
    console.log(`residual tag comments:         ${report.residualTagComments}`)
    console.log(`content loss comments:         ${report.contentLossComments}`)
    console.log(`validation failures:           ${report.validationFailures}`)
    console.log(
      `link nodes produced:           ${report.totalLinkNodesProduced} (aOpen=${report.totalAOpen}, aClose=${report.totalAClose})`,
    )
    console.log(`linebreak nodes produced:      ${report.totalLinebreakNodesProduced} (br tags=${report.totalBr})`)
    console.log(`paragraph splits produced:     ${report.totalParagraphSplitsProduced}`)
    console.log(`report written to:             ${outputPath}`)

    const ok =
      report.validationFailures === 0 &&
      report.residualTagComments === 0 &&
      report.contentLossComments === 0 &&
      countsOk

    if (!ok) {
      process.exit(1)
    }

    console.log('comments cleaned: OK')
  } catch (err) {
    try {
      await client.end()
    } catch {
      // ignore
    }
    console.error('verifier failed:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
