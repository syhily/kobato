import type { NestedFragment } from '@/server/domains/pt/services/pt-to-lexical'
import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { NonRecursiveBlock, PortableTextBody, TextBlock } from '@/shared/pt/schema'

import { computeBodyText } from '@/server/infra/pt/lexical-projection'
import { collectLexicalHeadings, collectLexicalImageStoragePaths } from '@/shared/lexical/collect'
import { headingLevelFromStyle } from '@/shared/pt/heading-levels'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Row-level cross-validation for the R15 PT→Lexical backfill (plan
// docs/plans/inkling-editor-replacement.md, M2 回填后全量校验). The
// zero-loss gate compares the DIRECT conversion against PT-native
// projections under the registered equivalence criteria (等价口径 — the R9b
// ledger records that the two plain-text corpora differ by design; string
// equality was never the contract):
//
//   E1 plain text — both sides normalize to trimmed, non-empty lines.
//     Excluded on BOTH sides by definition:
//       · inline math (a PT mathInline span's text is the tex source, which
//         the retired renderer ignored; Lexical math-inline projects '')
//       · music players (PT projects `[Music: <id>]`; Lexical projects the
//         save-time meta snapshot — name/artist lines)
//       · solution / two-column card text at top level (checked per card
//         against the converted fragment instead, NODE-level — the card
//         corpus contribution is htmlToPlainText over the dataset, which
//         cannot line-split KaTeX/shiki markup faithfully)
//       · footnote definition bodies (PT's bodyToPlainText included them;
//         the footnotedefinition card's content property carries no
//         wordCount flag, so Lexical projects '')
//     Counted on both sides: block math tex, code, image alt, `---`,
//     footnote-ref digits.
//   E2 headings — (depth, trimmed text) sequence equality between the PT
//     top-level heading slots and `collectLexicalHeadings`; card-nested
//     headings are excluded (R10 登记: cards are opaque to derived columns;
//     the real corpus has none). Slugs are NOT compared: the slug policy
//     flipped from github-slugger/pinyin to inkling's slugify at R9a — the
//     per-row slug-set divergence against the STORED column is counted for
//     the report instead.
//   E3 image sources — exact array equality (deduped, first-seen order)
//     between PT TOP-LEVEL image storagePaths and
//     `collectLexicalImageStoragePaths`. Card-nested image paths are
//     invisible to the Lexical derived column by design (cards are opaque)
//     and counted separately.
//   E4 comments — the old `content` column was a markdown snapshot; R12
//     redefined it as the feed-variant degraded-HTML projection, so
//     byte-equality with the old value is impossible by construction. The
//     comment check is E1 (restricted walker) + projection success.
//   E5 HTML round-trip — inkling's OWN export→import stability of the
//     stored body_html projection: `htmlToLexicalState(bodyHtml,
//     {alignment:'keep'})` then headings / image (src,alt) / plain text are
//     compared against the direct state. Music, solution/two-column,
//     footnote-section and KaTeX math markup is excised before import (the
//     cards are datasets, not importable markup; any `<math>` element zeroes
//     inkling's whole import — bisected on the real corpus). The plain-text
//     leg strips image/math nodes on BOTH sides (image alt projects only via
//     the kobato projection class, which the importer does not register;
//     math tex is E1's comparison). NON-FAILING: mismatches — and even a
//     throwing importer — are counted as warnings for the audit; the stored
//     data is the direct conversion, not the round trip.
//
// (The plan's `PT→HTML→htmlToLexicalState` comparison leg was written when
// a PT HTML renderer still existed; R14 retired `@portabletext/to-html`
// with `pt-html.ts`, so the HTML leg starts from the converted state's own
// projection. The independent-path loss detection the plan wanted is
// carried by E1–E3, which compare against PT-native projections computed
// straight from the source row.)

/** Re-exported shape documentation: `NestedFragment` lives in
 * `./pt-to-lexical` (the producer); imported above. */

export interface CrossCheckResult {
  /** E1/E2/E3 (and comment E4) all passed. */
  ok: boolean
  failures: string[]
  /** E5 round-trip mismatches — counted, never row-failing. */
  warnings: string[]
  /** Stored heading slugs that change under the inkling slug policy. */
  slugPolicyChanges: number
  /** Card-nested image storage paths excluded from the derived column. */
  nestedImageStoragePaths: string[]
  /** Card-nested headings excluded from the TOC (expected zero). */
  nestedHeadings: number
}

function normalizeLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function isMathInlineMark(block: TextBlock, span: { marks?: string[] | undefined }): boolean {
  const markDefs = block.markDefs ?? []
  return (span.marks ?? []).some((mark) => markDefs.some((def) => def._key === mark && def._type === 'mathInline'))
}

/** PT text-block corpus contribution under E1 (inline-math spans excluded). */
function ptBlockText(block: TextBlock): string {
  return block.children
    .filter((span) => !isMathInlineMark(block, span))
    .map((span) => span.text)
    .join('')
}

/** PT corpus lines of one nested-block run (solution pane / footnote body). */
function ptNestedLines(blocks: readonly NonRecursiveBlock[], out: string[]): void {
  // Streak-aware list joining: Lexical's ElementNode.getTextContent inserts
  // '\n' only after non-inline element children (except the last), so a
  // nested list concatenates its FIRST item onto the parent listitem's text
  // with no separator. The PT corpus mirrors that rule — the first item of a
  // deeper level extends the parent item's line, siblings start new lines
  // (verified against the real projection on the mixed number→bullet corpus
  // rows). A level skip (L1→L3) has no PT parent line: the converter's
  // synthesized empty parent item contributes a fresh line, so we push.
  const lineByLevel = new Map<number, number>()
  let prevListLevel = 0
  for (const block of blocks) {
    if (block._type === 'block' && block.listItem !== undefined) {
      const level = Math.max(1, block.level ?? 1)
      const text = ptBlockText(block)
      const parentLine = level > prevListLevel ? lineByLevel.get(level - 1) : undefined
      if (parentLine !== undefined) {
        out[parentLine] = (out[parentLine] ?? '') + text
        lineByLevel.set(level, parentLine)
      } else {
        lineByLevel.set(level, out.length)
        out.push(text)
      }
      for (const key of lineByLevel.keys()) {
        if (key > level) {
          lineByLevel.delete(key)
        }
      }
      prevListLevel = level
      continue
    }
    prevListLevel = 0
    lineByLevel.clear()
    switch (block._type) {
      case 'block':
        out.push(ptBlockText(block))
        break
      case 'code':
        out.push(block.code)
        break
      case 'mathBlock':
        out.push(block.tex)
        break
      case 'image':
        if (block.alt !== undefined && block.alt !== '') {
          out.push(block.alt)
        }
        break
      case 'horizontalRule':
        out.push('---')
        break
      case 'table':
        for (const row of block.rows) {
          for (const cell of row.cells) {
            out.push(cell.content.map((span) => span.text).join(''))
          }
        }
        break
      case 'musicPlayer':
        // Excluded from the corpus on both sides (meta snapshot lines).
        break
    }
  }
}

/** The E1 PT-side corpus: top-level flow with the documented exclusions. */
export function expectedPtPlainTextLines(body: PortableTextBody): string[] {
  const raw: string[] = []
  // Consecutive non-card blocks flush through the walker as ONE run so the
  // streak-aware list joining sees the whole streak (cards split streaks in
  // the converted state too — the converter ends a list run at any non-list
  // block).
  let run: NonRecursiveBlock[] = []
  const flush = (): void => {
    if (run.length > 0) {
      ptNestedLines(run, raw)
      run = []
    }
  }
  for (const block of body) {
    if (
      block._type === 'solution' ||
      block._type === 'twoColumn' ||
      block._type === 'footnoteDefinition' ||
      block._type === 'musicPlayer'
    ) {
      // Cards: per-card check / excluded by definition.
      flush()
      continue
    }
    run.push(block)
  }
  flush()
  return raw.flatMap((text) => normalizeLines(text))
}

/** PT comment corpus (E4/E1 restricted walker: no cards, no headings). */
export function expectedCommentPlainTextLines(body: CommentBody): string[] {
  const raw: string[] = []
  ptNestedLines(unsafeCast<NonRecursiveBlock[]>(body), raw)
  return raw.flatMap((text) => normalizeLines(text))
}

/** Strips node types from a state copy (top-level and deeper). */
function stripNodeTypes(state: LexicalEditorState, types: ReadonlySet<string>): LexicalEditorState {
  const copy = structuredClone(state)
  const strip = (nodes: LexicalNodeJson[]): LexicalNodeJson[] => {
    const out: LexicalNodeJson[] = []
    for (const node of nodes) {
      if (types.has(node.type)) {
        continue
      }
      out.push(node.children === undefined ? node : { ...node, children: strip(node.children) })
    }
    return out
  }
  copy.root.children = strip(copy.root.children)
  return copy
}

/** The E1 Lexical-side corpus of the converted state (same exclusions). */
export function convertedPlainTextLines(state: LexicalEditorState): string[] {
  const stripped = stripNodeTypes(state, new Set(['solution', 'two-column', 'music-player']))
  return bodyTextLines(stripped)
}

// The headless editor rejects a childless root at setEditorState (Lexical
// error #38) — an all-excised fragment/import has an empty corpus, not a
// failure.
function bodyTextLines(state: LexicalEditorState): string[] {
  if (state.root.children.length === 0) {
    return []
  }
  return normalizeLines(computeBodyText(state))
}

interface PtHeadingSlot {
  depth: number
  text: string
}

/** Top-level PT heading slots under the E1 text rule (E2's PT side). */
export function expectedPtHeadings(body: PortableTextBody): { headings: PtHeadingSlot[]; nested: number } {
  const headings: PtHeadingSlot[] = []
  let nested = 0
  const visitNested = (blocks: readonly NonRecursiveBlock[]) => {
    for (const block of blocks) {
      if (block._type === 'block' && headingLevelFromStyle(block.style) !== null) {
        nested += 1
      }
    }
  }
  for (const block of body) {
    if (block._type === 'solution') {
      visitNested(block.children)
      continue
    }
    if (block._type === 'twoColumn') {
      visitNested(block.left)
      visitNested(block.right)
      continue
    }
    if (block._type === 'footnoteDefinition') {
      visitNested(block.children)
      continue
    }
    if (block._type !== 'block') {
      continue
    }
    const depth = headingLevelFromStyle(block.style)
    if (depth === null) {
      continue
    }
    const text = ptBlockText(block).trim()
    if (text === '') {
      continue
    }
    headings.push({ depth, text })
  }
  return { headings, nested }
}

function convertedHeadings(state: LexicalEditorState): PtHeadingSlot[] {
  return collectLexicalHeadings(state).map((heading) => ({ depth: heading.depth, text: heading.text }))
}

/** Top-level PT image storage paths (E3's PT side) + the card-nested ones. */
export function expectedPtImageStoragePaths(body: PortableTextBody): { topLevel: string[]; nested: string[] } {
  const topLevel = new Set<string>()
  const nested = new Set<string>()
  const collect = (block: NonRecursiveBlock, into: Set<string>) => {
    if (block._type === 'image' && typeof block.storagePath === 'string' && block.storagePath !== '') {
      into.add(block.storagePath)
    }
  }
  for (const block of body) {
    if (block._type === 'solution') {
      for (const child of block.children) {
        collect(child, nested)
      }
      continue
    }
    if (block._type === 'twoColumn') {
      for (const child of [...block.left, ...block.right]) {
        collect(child, nested)
      }
      continue
    }
    if (block._type === 'footnoteDefinition') {
      for (const child of block.children) {
        collect(child, nested)
      }
      continue
    }
    collect(block, topLevel)
  }
  return { topLevel: [...topLevel], nested: [...nested] }
}

function diffLines(expected: readonly string[], actual: readonly string[]): string {
  const length = Math.max(expected.length, actual.length)
  for (let i = 0; i < length; i += 1) {
    const e = expected[i]
    const a = actual[i]
    if (e !== a) {
      return `line ${i}: expected ${JSON.stringify(e?.slice(0, 80) ?? null)} got ${JSON.stringify(a?.slice(0, 80) ?? null)} (expected ${expected.length} lines, got ${actual.length})`
    }
  }
  return ''
}

function countSlugPolicyChanges(storedHeadings: unknown, converted: LexicalEditorState): number {
  if (!Array.isArray(storedHeadings)) {
    return 0
  }
  const next = collectLexicalHeadings(converted)
  let changes = 0
  for (let i = 0; i < next.length; i += 1) {
    const stored: unknown = storedHeadings[i]
    if (
      stored === null ||
      typeof stored !== 'object' ||
      unsafeCast<{ slug?: unknown }>(stored).slug !== next[i]!.slug
    ) {
      changes += 1
    }
  }
  return changes
}

export interface ArticleCrossCheckInput {
  ptBody: PortableTextBody
  converted: LexicalEditorState
  /** Fragments captured by the converter (solution/two-column/footnote legs). */
  nestedFragments: NestedFragment[]
  /** The row's stored (pre-backfill) `headings` column — slug policy count. */
  storedHeadings: unknown
}

/**
 * The zero-loss gate for one article/page revision row (E1–E3 + the per-card
 * fragment check). No jsdom — all comparisons run on states/collectors.
 */
export function crossCheckArticleConversion(input: ArticleCrossCheckInput): CrossCheckResult {
  const failures: string[] = []
  const result: CrossCheckResult = {
    ok: true,
    failures,
    warnings: [],
    slugPolicyChanges: countSlugPolicyChanges(input.storedHeadings, input.converted),
    nestedImageStoragePaths: [],
    nestedHeadings: 0,
  }

  // E1 top-level corpus.
  const expectedText = expectedPtPlainTextLines(input.ptBody)
  const actualText = convertedPlainTextLines(input.converted)
  const textDiff = diffLines(expectedText, actualText)
  if (textDiff !== '') {
    failures.push(`plain-text: ${textDiff}`)
  }

  // E1 card legs: each PT nested run vs its converted fragment (node-level).
  for (const fragment of input.nestedFragments) {
    const expected: string[] = []
    ptNestedLines(fragment.ptBlocks, expected)
    const expectedLines = expected.flatMap((text) => normalizeLines(text))
    const fragmentState = unsafeCast<LexicalEditorState>({
      root: { type: 'root', version: 1, children: fragment.nodes, direction: 'ltr', format: '', indent: 0 },
    })
    const actualLines = bodyTextLines(fragmentState)
    const diff = diffLines(expectedLines, actualLines)
    if (diff !== '') {
      const where = fragment.side === undefined ? '' : ` ${fragment.side}`
      failures.push(`card-fragment ${fragment.container}${where} (${fragment.key}): ${diff}`)
    }
  }

  // E2 headings.
  const expectedHeadings = expectedPtHeadings(input.ptBody)
  result.nestedHeadings = expectedHeadings.nested
  const actualHeadings = convertedHeadings(input.converted)
  if (expectedHeadings.headings.length !== actualHeadings.length) {
    failures.push(`headings: expected ${expectedHeadings.headings.length}, got ${actualHeadings.length}`)
  } else {
    for (let i = 0; i < expectedHeadings.headings.length; i += 1) {
      const e = expectedHeadings.headings[i]!
      const a = actualHeadings[i]!
      if (e.depth !== a.depth || e.text !== a.text) {
        failures.push(
          `headings: entry ${i} expected h${e.depth} ${JSON.stringify(e.text.slice(0, 60))} got h${a.depth} ${JSON.stringify(a.text.slice(0, 60))}`,
        )
        break
      }
    }
  }

  // E3 image sources.
  const images = expectedPtImageStoragePaths(input.ptBody)
  result.nestedImageStoragePaths = images.nested
  const actualImages = collectLexicalImageStoragePaths(input.converted)
  if (images.topLevel.join('\n') !== actualImages.join('\n')) {
    failures.push(`image-sources: expected [${images.topLevel.join(', ')}], got [${actualImages.join(', ')}]`)
  }

  result.ok = failures.length === 0
  return result
}

/** The comment-row gate (E4): E1 restricted corpus comparison. */
export function crossCheckCommentConversion(ptBody: CommentBody, converted: LexicalEditorState): CrossCheckResult {
  const failures: string[] = []
  const result: CrossCheckResult = {
    ok: true,
    failures,
    warnings: [],
    slugPolicyChanges: 0,
    nestedImageStoragePaths: [],
    nestedHeadings: 0,
  }
  const diff = diffLines(expectedCommentPlainTextLines(ptBody), bodyTextLines(converted))
  if (diff !== '') {
    failures.push(`plain-text: ${diff}`)
  }
  result.ok = failures.length === 0
  return result
}

interface RoundTripImage {
  src: string
  alt: string
}

function imagePairsOf(state: LexicalEditorState): RoundTripImage[] {
  const out: RoundTripImage[] = []
  const walk = (nodes: readonly LexicalNodeJson[]) => {
    for (const node of nodes) {
      if (node.type === 'image') {
        const view = unsafeCast<{ src?: unknown; alt?: unknown }>(node)
        out.push({
          src: typeof view.src === 'string' ? view.src : '',
          alt: typeof view.alt === 'string' ? view.alt : '',
        })
      }
      if (node.children !== undefined) {
        walk(node.children)
      }
    }
  }
  walk(state.root.children)
  return out
}

/**
 * E5: the stored body_html projection's export→import stability, checked
 * through inkling's real importer. Card-dataset markup (music / solution /
 * two-column / the footnotes section) and the KaTeX math markup are excised
 * first — they are not importable by design; their fidelity is the per-card
 * fragment check's and E1's job. Mismatches are WARNINGS, never row failures.
 */
export async function htmlRoundTripCrossCheck(converted: LexicalEditorState, bodyHtml: string): Promise<string[]> {
  const { htmlToLexicalState } = await import('@inkling/editor/headless')
  const { JSDOM } = await import('jsdom')

  const dom = new JSDOM(bodyHtml)
  const document = dom.window.document
  for (const el of document.querySelectorAll('.aplayer')) {
    el.parentElement?.remove()
  }
  // Card datasets and the KaTeX math markup are not importable: the card
  // constructs are datasets (not markup), and any `<math>` element zeroes
  // inkling's whole import (bisected on the real corpus, R15a). Math
  // fidelity is E1's job (tex compared PT-natively).
  for (const el of document.querySelectorAll(
    'blockquote.solution, section[data-pt-two-column], section.footnotes, .inkling-math-inline, .inkling-math-card',
  )) {
    el.remove()
  }
  const cleanedHtml = document.body.innerHTML
  dom.window.close()

  const imported = unsafeCast<LexicalEditorState>(await htmlToLexicalState(cleanedHtml, { alignment: 'keep' }))

  const warnings: string[] = []

  // The text leg excludes the card constructs plus image and math nodes:
  // images project alt text only on the direct side (the kobato projection
  // class owns getTextContent; the importer rebuilds stock image nodes), and
  // math markup was excised above. Image fidelity is the (src,alt) pair leg
  // below; math fidelity is E1's tex comparison. Whitespace RUNS collapse on
  // both sides — the excised math spans leave boundary-space artifacts the
  // importer's HTML normalization handles differently (cosmetic only).
  const TEXT_STRIPPED = new Set(['solution', 'two-column', 'music-player', 'image', 'math', 'math-inline'])
  const relax = (lines: string[]): string[] => lines.map((line) => line.replace(/\s+/g, ' '))
  const directText = relax(bodyTextLines(stripNodeTypes(converted, TEXT_STRIPPED)))
  const rtText = relax(bodyTextLines(stripNodeTypes(imported, TEXT_STRIPPED)))
  const textDiff = diffLines(directText, rtText)
  if (textDiff !== '') {
    warnings.push(`round-trip plain-text: ${textDiff}`)
  }

  const directHeadings = convertedHeadings(converted)
  const rtHeadings = convertedHeadings(imported)
  const directSig = directHeadings.map((h) => `${h.depth}:${h.text}`).join('\n')
  const rtSig = rtHeadings.map((h) => `${h.depth}:${h.text}`).join('\n')
  if (directSig !== rtSig) {
    warnings.push(`round-trip headings: expected ${directHeadings.length}, got ${rtHeadings.length}`)
  }

  const directImages = imagePairsOf(converted)
  const rtImages = imagePairsOf(imported)
  const directImgSig = directImages.map((img) => `${img.src}|${img.alt}`).join('\n')
  const rtImgSig = rtImages.map((img) => `${img.src}|${img.alt}`).join('\n')
  if (directImgSig !== rtImgSig) {
    warnings.push(`round-trip images: expected ${directImages.length}, got ${rtImages.length}`)
  }

  return warnings
}
