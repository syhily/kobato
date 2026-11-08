// AST scanner behind tests/unit/arch/ui-i18n-literals.test.ts.
//
// The rule set is deliberately small and precise — a cheap text/regex grep
// would either miss copy or drown in false positives. Every rule maps to one
// syntax position where interface copy (or a hardcoded locale) can hide:
//
//   jsx-text          JSX children — text nodes AND expression children
//                     (`{'保存'}`, {`保存 ${name}`}, `{ok ? '保存' : '取消'}`)
//   jsx-attribute     aria-label / placeholder / title / alt literals
//   title-meta        `titleMeta('…')` arguments
//   toast             `toast.*('…')` messages
//   domain-error      `new DomainError('CODE', '…')` user-facing messages
//   to-locale         `toLocale*()` with no meaningful locale (omitted,
//                     `undefined`, `void 0`, `[]`)
//   hardcoded-locale  exact literals naming a supported locale or one of its
//                     aliases (interpolated templates never match)
//   han-literal       any plain/template literal containing Han characters —
//                     the blind spot of registries and ordinary template
//                     strings (`label: '保存'`, `` `第 ${n} 页` ``). JSX
//                     positions stay owned by jsx-text/jsx-attribute so copy is
//                     never reported twice.
//
// Template literals are inspected with each interpolation replaced by a marker,
// so `保存 ${name}` is still copy; a `=== 'admin'` comparison operand is not.
// Exemptions are file/rule/snippet exact — never a blanket directory skip.
//
// Positions are computed from a per-file line-start index with a binary search,
// so reporting thousands of hits stays O(hits · log lines) instead of rescanning
// the source from offset 0 for every hit. Whole-file content libraries (the
// vendored quote bank, the emergency fallback catalog) are excluded before the
// file is read or parsed — their strings are data, not UI chrome.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parseAst } from 'vite'

import { isKnownLocaleValue } from '@/shared/i18n/locales'

export type ScanRule =
  | 'jsx-text'
  | 'jsx-attribute'
  | 'title-meta'
  | 'toast'
  | 'domain-error'
  | 'to-locale'
  | 'hardcoded-locale'
  | 'han-literal'

export interface ScanViolation {
  rule: ScanRule
  /** Repo-relative, POSIX-separated path. */
  file: string
  line: number
  column: number
  text: string
}

export interface ScanAllowlistEntry {
  /** Repo-relative file path, or a directory prefix (matched as `path/…`). */
  path: string
  /** Restrict the exemption to these rules; omit to exempt every rule in the path. */
  rules?: readonly ScanRule[]
  /** Restrict the exemption to a match whose trimmed text equals this snippet. */
  text?: string
}

export interface ScanOptions {
  /** Repo-relative files or directory prefixes to scan. */
  roots: readonly string[]
  allowlist?: readonly ScanAllowlistEntry[]
}

export interface ScanResult {
  violations: ScanViolation[]
  allowlisted: ScanViolation[]
  scannedFiles: string[]
  /** Content-store files reached under the roots but never read or parsed. */
  skippedFiles: string[]
}

/** Latin letters, accented Latin, Greek/Cyrillic, Han, Kana, Hangul. */
const COPY_TEXT =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/

const HAN_TEXT = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

/**
 * Copy stores: their string values ARE the localized catalog (four shipped
 * locales or an Inkling label table per locale). Their directory prefixes stay
 * in the parse set — they also hold keys and identifiers the other rules must
 * see — but `han-literal` is off by design rather than by allowlist.
 */
const COPY_STORE_PREFIXES = [
  'src/shared/i18n/messages/',
  'src/shared/i18n/inkling-labels/',
  'src/client/editor/inkling-labels/',
]

/**
 * Whole-file content libraries: every string is data (the vendored quote bank,
 * the client's emergency fallback catalog), so the scanner skips them BEFORE
 * reading or parsing — a 1.3 MB quote bank must not cost an AST walk or
 * thousands of findings an allowlist would then have to exempt.
 */
const COPY_STORE_FILES = new Set(['src/shared/i18n/fallback-messages.ts', 'src/server/render/calendar/local-quotes.ts'])

/** Whether `file` is a whole-file content library the scanner never parses. */
export function isContentStoreFile(file: string): boolean {
  return COPY_STORE_FILES.has(file)
}

function isHanCopyStore(file: string): boolean {
  return COPY_STORE_PREFIXES.some((prefix) => file.startsWith(prefix))
}

const COPY_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'title', 'alt'])

/** Dotted message id (`meta.title.admin.dashboard`) — the only accepted titleMeta() argument. */
const MESSAGE_ID = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/

interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function isNode(value: unknown): value is AstNode {
  return value !== null && typeof value === 'object' && typeof (value as AstNode).type === 'string'
}

/** Offsets of every line start: index 0 is line 1, index i is line i + 1. */
function lineStartOffsets(source: string): number[] {
  const starts = [0]
  let newline = source.indexOf('\n')
  while (newline !== -1) {
    starts.push(newline + 1)
    newline = source.indexOf('\n', newline + 1)
  }
  return starts
}

/** 1-based line/column from the line-start index — O(log lines), not O(offset). */
function positionAt(starts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= offset) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return { line: low + 1, column: offset - starts[low] + 1 }
}

function identifierName(node: unknown): string | null {
  if (!isNode(node)) {
    return null
  }
  if ((node.type === 'Identifier' || node.type === 'JSXIdentifier') && typeof node.name === 'string') {
    return node.name
  }
  return null
}

/** Placeholder inserted for an interpolation so copy around it stays visible. */
const INTERPOLATION_MARKER = '\u2026'

interface TemplateQuasis {
  text: string
  interpolated: boolean
}

function templateQuasis(node: AstNode): TemplateQuasis | null {
  const quasis = node.quasis
  if (!Array.isArray(quasis)) {
    return null
  }
  const parts: string[] = []
  for (const quasi of quasis) {
    const value = (quasi as { value?: { cooked?: string; raw?: string } }).value
    parts.push(value?.cooked ?? value?.raw ?? '')
  }
  const expressions = node.expressions
  return {
    text: parts.join(INTERPOLATION_MARKER),
    interpolated: Array.isArray(expressions) && expressions.length > 0,
  }
}

/**
 * The literal copy a node carries: a string literal verbatim, a template with
 * each interpolation replaced by a marker (so `` `保存 ${name}` `` still reads
 * as copy), or a JSX expression wrapper around either.
 */
function literalText(node: unknown): string | null {
  if (!isNode(node)) {
    return null
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral') {
    return templateQuasis(node)?.text ?? null
  }
  if (node.type === 'JSXExpressionContainer') {
    return literalText(node.expression)
  }
  return null
}

/**
 * Exact text only when the node carries no interpolation — used for locale
 * literals, where `zh-${x}` must never match but `` `zh-CN` `` must.
 */
function exactText(node: unknown): string | null {
  if (!isNode(node)) {
    return null
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral') {
    const quasis = templateQuasis(node)
    return quasis !== null && !quasis.interpolated ? quasis.text : null
  }
  return null
}

/**
 * Copy-bearing strings inside a JSX child expression. The expression's own
 * branches are followed (`? :`, `&&`, `+` chains, `as` casts) so neither arm
 * of a conditional can hide copy; comparisons keep their operands out of
 * scope (an `=== 'admin'` test is not interface copy).
 */
function expressionCopyTexts(node: unknown, out: string[] = []): string[] {
  if (!isNode(node)) {
    return out
  }
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string' && COPY_TEXT.test(node.value)) {
        out.push(node.value)
      }
      return out
    case 'TemplateLiteral': {
      const text = literalText(node)
      if (text !== null && COPY_TEXT.test(text)) {
        out.push(text)
      }
      return out
    }
    case 'ConditionalExpression':
      expressionCopyTexts(node.consequent, out)
      expressionCopyTexts(node.alternate, out)
      return out
    case 'LogicalExpression':
      expressionCopyTexts(node.right, out)
      return out
    case 'BinaryExpression':
      if (node.operator === '+') {
        expressionCopyTexts(node.left, out)
        expressionCopyTexts(node.right, out)
      }
      return out
    case 'ParenthesizedExpression':
    case 'JSXExpressionContainer':
    case 'TSAsExpression':
    case 'TSNonNullExpression':
      return expressionCopyTexts(node.expression, out)
    default:
      return out
  }
}

/** `toLocale*()` with no meaningful locale: omitted, `undefined`, `void 0`, or `[]`. */
function isAbsentLocaleArgument(argument: unknown): boolean {
  if (!isNode(argument)) {
    return true
  }
  if (argument.type === 'Identifier' && argument.name === 'undefined') {
    return true
  }
  if (argument.type === 'UnaryExpression' && argument.operator === 'void') {
    return true
  }
  if (argument.type === 'ArrayExpression') {
    const elements = argument.elements
    return !Array.isArray(elements) || elements.length === 0
  }
  return false
}

function callArguments(node: AstNode): unknown[] {
  const args = node.arguments
  return Array.isArray(args) ? args : []
}

function report(ctx: VisitContext, rule: ScanRule, node: AstNode, text: string): void {
  const { line, column } = positionAt(ctx.lineStarts, node.start)
  ctx.violations.push({ rule, file: ctx.file, line, column, text })
}

interface VisitContext {
  /** Per-file line-start offsets: positions are binary-searched, never rescanned. */
  lineStarts: readonly number[]
  file: string
  violations: ScanViolation[]
  /** Set while descending into a JSX position already covered by jsx-text/jsx-attribute. */
  jsxCopyCovered?: boolean
  /** Nodes already reported by a position-specific rule (toast/DomainError/titleMeta). */
  hanCoveredNodes: WeakSet<object>
  /** The file is a copy-store prefix — `han-literal` does not apply. */
  hanCopyStore: boolean
}

function visit(node: AstNode, ctx: VisitContext): void {
  const { hanCopyStore } = ctx

  switch (node.type) {
    case 'JSXText': {
      const value = typeof node.value === 'string' ? node.value : ''
      if (value.trim() !== '' && COPY_TEXT.test(value)) {
        report(ctx, 'jsx-text', node, value.trim())
      }
      break
    }
    case 'JSXElement':
    case 'JSXFragment': {
      // Children that are strings, not attributes: `{'保存'}` / {`保存 ${name}`}
      // / `{ok ? '保存' : '取消'}`. Attribute values are handled by JSXAttribute,
      // so nothing is reported twice.
      const children = node.children
      if (Array.isArray(children)) {
        for (const child of children) {
          if (isNode(child) && child.type === 'JSXExpressionContainer') {
            for (const text of expressionCopyTexts(child.expression)) {
              report(ctx, 'jsx-text', child, text)
            }
          }
        }
      }
      break
    }
    case 'JSXAttribute': {
      const name = identifierName(node.name)
      if (name === null || !COPY_ATTRIBUTES.has(name)) {
        break
      }
      // `alt="封面图"` / `placeholder={`请输入`}` / `title={ok ? '保存' : '取消'}`:
      // the expression helper covers every branch and filters non-copy text.
      const value = node.value
      const expression = isNode(value) && value.type === 'JSXExpressionContainer' ? value.expression : value
      for (const text of expressionCopyTexts(expression)) {
        report(ctx, 'jsx-attribute', node, text)
      }
      break
    }
    case 'CallExpression': {
      const args = callArguments(node)
      const callee = node.callee
      const calleeName = identifierName(callee)
      if (calleeName === 'titleMeta') {
        // Static titles are message ids: a dotted id is the correct form, any
        // other literal is unlocalized copy.
        const text = literalText(args[0])
        if (text !== null && !MESSAGE_ID.test(text.trim())) {
          report(ctx, 'title-meta', node, text)
          if (isNode(args[0])) {
            ctx.hanCoveredNodes.add(args[0])
          }
        }
      }
      if (isNode(callee) && callee.type === 'MemberExpression') {
        const objectName = identifierName(callee.object)
        const propertyName = identifierName(callee.property)
        if (objectName === 'toast') {
          const text = literalText(args[0])
          if (text !== null && COPY_TEXT.test(text)) {
            report(ctx, 'toast', node, text)
            if (isNode(args[0])) {
              ctx.hanCoveredNodes.add(args[0])
            }
          }
        }
        if (propertyName !== null && propertyName.startsWith('toLocale') && isAbsentLocaleArgument(args[0])) {
          report(ctx, 'to-locale', node, `${objectName ?? '…'}.${propertyName}()`)
        }
      }
      break
    }
    case 'NewExpression': {
      if (identifierName(node.callee) === 'DomainError') {
        const messageArg = callArguments(node)[1]
        const text = literalText(messageArg)
        if (text !== null && COPY_TEXT.test(text)) {
          report(ctx, 'domain-error', node, text)
          if (isNode(messageArg)) {
            ctx.hanCoveredNodes.add(messageArg)
          }
        }
      }
      break
    }
    case 'Literal': {
      if (typeof node.value !== 'string') {
        break
      }
      if (isKnownLocaleValue(node.value) && node.value.trim() !== '') {
        report(ctx, 'hardcoded-locale', node, node.value)
      }
      // JSX copy is reported by the JSX rules above; this catches registries,
      // Zod messages, error text and any other plain string literal.
      if (!hanCopyStore && ctx.jsxCopyCovered !== true && !ctx.hanCoveredNodes.has(node) && HAN_TEXT.test(node.value)) {
        report(ctx, 'han-literal', node, node.value)
      }
      break
    }
    case 'TemplateLiteral': {
      // Only an interpolation-free template is an exact locale literal.
      const text = exactText(node)
      if (text !== null && text.trim() !== '' && isKnownLocaleValue(text)) {
        report(ctx, 'hardcoded-locale', node, text)
      }
      // Interpolated templates are the classic blind spot: `第 ${n} 页` is
      // still interface copy, so inspect the quasi text (interpolations become
      // one marker) rather than requiring an exact literal.
      const rendered = templateQuasis(node)?.text ?? null
      if (
        !hanCopyStore &&
        ctx.jsxCopyCovered !== true &&
        !ctx.hanCoveredNodes.has(node) &&
        rendered !== null &&
        HAN_TEXT.test(rendered)
      ) {
        report(ctx, 'han-literal', node, rendered)
      }
      break
    }
  }

  // Everything under a JSX element/attribute is already covered by the JSX
  // rules; marking the subtree keeps han-literal from double-reporting.
  const childCtx: VisitContext =
    node.type === 'JSXElement' || node.type === 'JSXFragment' || node.type === 'JSXAttribute'
      ? { ...ctx, jsxCopyCovered: true }
      : ctx
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          visit(item, childCtx)
        }
      }
    } else if (isNode(value)) {
      visit(value, childCtx)
    }
  }
}

/**
 * Scan one source text. `file` selects the parser dialect, the reported path
 * and the content-store skip. Content stores return `[]` BEFORE the parser
 * runs — they are data libraries, and a parse would be pure cost.
 */
export function scanSourceForI18nLiterals(source: string, file: string): ScanViolation[] {
  if (isContentStoreFile(file)) {
    return []
  }
  const violations: ScanViolation[] = []
  // `parseAst` throws on a syntax error — a scan that silently skipped a file
  // would be worse than no scan at all.
  const program = parseAst(source, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' }, file)
  visit(program as unknown as AstNode, {
    lineStarts: lineStartOffsets(source),
    file,
    violations,
    hanCoveredNodes: new WeakSet(),
    hanCopyStore: isHanCopyStore(file),
  })
  return violations
}

export function applyAllowlist(
  violations: readonly ScanViolation[],
  allowlist: readonly ScanAllowlistEntry[],
): { violations: ScanViolation[]; allowlisted: ScanViolation[] } {
  const kept: ScanViolation[] = []
  const exempt: ScanViolation[] = []
  for (const violation of violations) {
    const matched = allowlist.some(
      (entry) =>
        (violation.file === entry.path || violation.file.startsWith(`${entry.path}/`)) &&
        (entry.rules === undefined || entry.rules.includes(violation.rule)) &&
        (entry.text === undefined || violation.text.trim() === entry.text),
    )
    if (matched) {
      exempt.push(violation)
    } else {
      kept.push(violation)
    }
  }
  return { violations: kept, allowlisted: exempt }
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

function isScannableFile(path: string): boolean {
  return /\.(ts|tsx)$/.test(path) && !path.endsWith('.d.ts')
}

/** Expand one root — a directory (recursive) or a single file — into repo-relative paths. */
function collectFiles(root: string, cwd: string): string[] {
  const absolute = join(cwd, root)
  if (statSync(absolute).isFile()) {
    return isScannableFile(absolute) ? [toPosixPath(relative(cwd, absolute))] : []
  }
  const found: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.isFile() && isScannableFile(entry.name)) {
        found.push(toPosixPath(relative(cwd, full)))
      }
    }
  }
  walk(absolute)
  return found
}

/** Scan every production source file under `roots`. */
export function scanI18nLiterals(options: ScanOptions): ScanResult {
  const cwd = process.cwd()
  const discovered = [...new Set(options.roots.flatMap((root) => collectFiles(root, cwd)))].sort()
  // Content stores are split off before the read: a multi-megabyte data file
  // costs no I/O and produces no findings the allowlist would have to excuse.
  const skippedFiles = discovered.filter((file) => isContentStoreFile(file))
  const scannedFiles = discovered.filter((file) => !isContentStoreFile(file))
  const violations: ScanViolation[] = []
  for (const file of scannedFiles) {
    violations.push(...scanSourceForI18nLiterals(readFileSync(join(cwd, file), 'utf8'), file))
  }
  const filtered = applyAllowlist(violations, options.allowlist ?? [])
  return { violations: filtered.violations, allowlisted: filtered.allowlisted, scannedFiles, skippedFiles }
}
